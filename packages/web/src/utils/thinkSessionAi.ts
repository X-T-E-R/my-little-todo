import type { ExtractedAction, Task, ThinkSessionStartMode } from '@my-little-todo/core';
import { daysUntil, displayTaskTitle } from '@my-little-todo/core';
import { getSetting } from '../storage/settingsApi';
import { buildRefContextForAi, formatTaskRefMarkdown, resolveTaskRefToId } from './taskRefs';

export interface OpenAiConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

function hasDeadline(task: Task): task is Task & { ddl: Date } {
  return task.ddl instanceof Date;
}

export async function loadOpenAiConfig(): Promise<OpenAiConfig | null> {
  const apiKey = await getSetting('ai-api-key');
  if (!apiKey?.trim()) return null;
  const endpointRaw = (await getSetting('ai-api-endpoint')) || 'https://api.openai.com/v1';
  const model = (await getSetting('ai-model')) || 'gpt-4o-mini';
  return {
    apiKey: apiKey.trim(),
    endpoint: endpointRaw.replace(/\/$/, ''),
    model,
  };
}

async function chatCompletion(cfg: OpenAiConfig, system: string, user: string): Promise<string> {
  const res = await fetch(`${cfg.endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty AI response');
  return text;
}

export async function runOpenAiText(system: string, user: string): Promise<string | null> {
  const cfg = await loadOpenAiConfig();
  if (!cfg) return null;
  return chatCompletion(cfg, system, user);
}

/** Rule-based discovery seed (works offline). */
export function buildDiscoverySeedMarkdown(
  tasks: Task[],
  lines: {
    headline: string;
    noActive: string;
    activeCount: (n: number) => string;
    ddlSoon: string;
    stale: string;
    prompt: string;
  },
): string {
  const active = tasks.filter((t) => t.status !== 'completed' && t.status !== 'archived');
  if (active.length === 0) {
    return `## ${lines.headline}\n\n${lines.noActive}\n\n`;
  }
  const now = Date.now();
  const withDdl = active.filter(hasDeadline).sort((a, b) => a.ddl.getTime() - b.ddl.getTime());
  const soon = withDdl.filter((t) => {
    const d = daysUntil(t.ddl);
    return d !== null && d <= 7;
  });
  const stale = active.filter((t) => now - t.updatedAt.getTime() > 7 * 86400000);

  const parts: string[] = [`## ${lines.headline}`, '', lines.activeCount(active.length), ''];

  if (soon.length > 0) {
    parts.push(`### ${lines.ddlSoon}`, '');
    for (const t of soon.slice(0, 8)) {
      const d = t.ddl;
      const du = daysUntil(d);
      parts.push(
        `- **${displayTaskTitle(t)}** — ${du !== null ? `${du}d` : ''} (${d.toLocaleDateString()})`,
      );
    }
    parts.push('');
  }

  if (stale.length > 0) {
    parts.push(`### ${lines.stale}`, '');
    for (const t of stale.slice(0, 8)) {
      const days = Math.floor((now - t.updatedAt.getTime()) / 86400000);
      parts.push(`- **${displayTaskTitle(t)}** — ${days}d since touch`);
    }
    parts.push('');
  }

  parts.push(lines.prompt);
  return parts.join('\n');
}

/** Rule-based arrange seed (works offline). */
export function buildArrangeSeedMarkdown(
  tasks: Task[],
  lines: {
    heading: string;
    footer: string;
    noDdl: string;
  },
): string {
  const active = tasks.filter((t) => t.status !== 'completed' && t.status !== 'archived');
  const sorted = [...active].sort((a, b) => {
    const ad = a.ddl ? a.ddl.getTime() : Number.POSITIVE_INFINITY;
    const bd = b.ddl ? b.ddl.getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });
  const parts: string[] = [`## ${lines.heading}`, ''];
  let n = 1;
  for (const t of sorted.slice(0, 40)) {
    const ddlStr = t.ddl ? `${t.ddl.toLocaleDateString()} (${t.ddlType ?? 'soft'})` : lines.noDdl;
    parts.push(`${n}. ${formatTaskRefMarkdown(t)} — ${ddlStr}`);
    n += 1;
  }
  parts.push('', lines.footer);
  return parts.join('\n');
}

export async function enhanceDiscoveryWithAi(baseMarkdown: string, tasks: Task[]): Promise<string> {
  const cfg = await loadOpenAiConfig();
  if (!cfg) return baseMarkdown;
  const summary = tasks
    .filter((t) => t.status !== 'completed' && t.status !== 'archived')
    .slice(0, 30)
    .map((t) => `- ${displayTaskTitle(t)}${t.ddl ? ` (ddl: ${t.ddl.toISOString()})` : ''}`)
    .join('\n');
  const system =
    'You help users think clearly. Output ONLY markdown (no code fence). Be warm, concise, non-judgmental. Suggest 1–3 gentle questions. Do not shame. Language: match the user text language.';
  const user = `Context tasks:\n${summary || '(none)'}\n\nStarter draft:\n${baseMarkdown}\n\nRewrite into a shorter, friendlier opening + 2–3 questions.`;
  try {
    return await chatCompletion(cfg, system, user);
  } catch {
    return baseMarkdown;
  }
}

export async function extractActionsFromText(
  markdown: string,
  tasks: Task[],
): Promise<ExtractedAction[]> {
  const cfg = await loadOpenAiConfig();
  if (!cfg) {
    return heuristicExtract(markdown, tasks);
  }
  const taskList = tasks.map((t) => `${t.id}: ${displayTaskTitle(t)}`).join('\n');
  const refBlock = buildRefContextForAi(tasks, markdown);
  const system = `You extract actionable items from the user's thinking notes. Reply with ONLY valid JSON:
{"actions":[{"description":"string","type":"create_task"|"update_priority"|"postpone"|"start_focus"|"other","relatedTaskId":"uuid or null","suggestedPriority":0.0}]}
Rules: at most 8 actions. Match relatedTaskId to known tasks when possible (use full UUID). If the note contains [[task:xxxxxxxx|Label]] tokens, the Task references section maps short ids to full ids — use those for relatedTaskId when the action concerns that task. suggestedPriority 0–1 only for update_priority.`;
  const user = `${refBlock}Known tasks:\n${taskList || '(none)'}\n\nNotes:\n${markdown.slice(0, 12000)}`;
  try {
    const raw = await chatCompletion(cfg, system, user);
    const json = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')) as {
      actions?: Partial<ExtractedAction>[];
    };
    const actions = json.actions ?? [];
    return actions.slice(0, 8).map((a, i) => ({
      id: crypto.randomUUID(),
      description: String(a.description ?? `Action ${i + 1}`),
      type: (a.type as ExtractedAction['type']) ?? 'other',
      adopted: false,
      relatedTaskId: a.relatedTaskId ?? undefined,
      suggestedPriority: typeof a.suggestedPriority === 'number' ? a.suggestedPriority : undefined,
    }));
  } catch {
    return heuristicExtract(markdown, tasks);
  }
}

function heuristicExtract(markdown: string, tasks: Task[]): ExtractedAction[] {
  const lines = markdown
    .split('\n')
    .filter((l) => /[-*]\s+/.test(l.trim()) || /^\d+\./.test(l.trim()));
  const out: ExtractedAction[] = [];
  for (const line of lines.slice(0, 5)) {
    const refMatch = line.match(/\[\[task:([a-f0-9]{8})\|[^\]]+\]\]/i);
    const relatedFromRef = refMatch ? resolveTaskRefToId(refMatch[1], tasks) : undefined;
    let text = line
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .trim();
    text = text.replace(/\[\[task:[a-f0-9]{8}\|[^\]]+\]\]\s*[—\-–]?\s*/gi, '').trim();
    if (text.length < 3 && relatedFromRef) {
      const linked = tasks.find((x) => x.id === relatedFromRef);
      if (linked) text = displayTaskTitle(linked);
    }
    if (text.length < 3) continue;
    out.push({
      id: crypto.randomUUID(),
      description: text.slice(0, 200),
      type: relatedFromRef ? 'update_priority' : 'create_task',
      adopted: false,
      relatedTaskId: relatedFromRef,
    });
  }
  if (out.length === 0 && markdown.trim().length > 20) {
    out.push({
      id: crypto.randomUUID(),
      description: markdown.trim().slice(0, 120),
      type: 'create_task',
      adopted: false,
    });
  }
  return out;
}

export async function seedContentForMode(
  mode: ThinkSessionStartMode,
  tasks: Task[],
  i18n: {
    discovery: Parameters<typeof buildDiscoverySeedMarkdown>[1];
    arrange: Parameters<typeof buildArrangeSeedMarkdown>[1];
  },
): Promise<string> {
  if (mode === 'blank') return '';
  if (mode === 'arrange') {
    return buildArrangeSeedMarkdown(tasks, i18n.arrange);
  }
  const base = buildDiscoverySeedMarkdown(tasks, i18n.discovery);
  return enhanceDiscoveryWithAi(base, tasks);
}
