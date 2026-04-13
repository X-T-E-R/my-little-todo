import type {
  Task,
  WorkThread,
  WorkThreadSuggestion,
  WorkThreadSuggestionKind,
} from '@my-little-todo/core';
import { displayTaskTitle } from '@my-little-todo/core';
import { runOpenAiText } from './thinkSessionAi';

function heuristicSuggestion(
  kind: WorkThreadSuggestionKind,
  thread: WorkThread,
): WorkThreadSuggestion {
  const now = Date.now();
  const contextTitles = thread.contextItems.map((item) => item.title).filter(Boolean);
  const docPreview = thread.docMarkdown.trim().split(/\n+/).slice(0, 4).join('\n');

  if (kind === 'organize_context') {
    const bullets =
      contextTitles.length > 0
        ? contextTitles.slice(0, 6).map((title) => `- ${title}`)
        : ['- No context captured yet'];
    return {
      id: crypto.randomUUID(),
      kind,
      title: '整理上下文建议',
      content: ['## Possible structure', '', '### Relevant context', ...bullets].join('\n'),
      createdAt: now,
      applied: false,
    };
  }

  if (kind === 'summarize_conclusion') {
    return {
      id: crypto.randomUUID(),
      kind,
      title: '当前结论草稿',
      content:
        docPreview.length > 0
          ? `## Tentative conclusion\n\n${docPreview}`
          : '## Tentative conclusion\n\nWrite down the clearest current conclusion in one short paragraph.',
      createdAt: now,
      applied: false,
    };
  }

  const extracted = thread.docMarkdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .slice(0, 4)
    .map((line) =>
      line
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim(),
    )
    .filter(Boolean);
  const nextSteps =
    extracted.length > 0
      ? extracted
      : contextTitles.slice(0, 3).map((title) => `Move ${title} forward`);
  return {
    id: crypto.randomUUID(),
    kind,
    title: '下一步建议',
    content: ['## Suggested next steps', '', ...nextSteps.map((step) => `- ${step}`)].join('\n'),
    createdAt: now,
    applied: false,
  };
}

export async function generateWorkThreadSuggestion(
  kind: WorkThreadSuggestionKind,
  thread: WorkThread,
  tasks: Task[],
): Promise<WorkThreadSuggestion> {
  const fallback = heuristicSuggestion(kind, thread);
  const taskLines = tasks
    .slice(0, 20)
    .map((task) => `- ${displayTaskTitle(task)}${task.id ? ` (${task.id})` : ''}`)
    .join('\n');
  const contextLines = thread.contextItems
    .slice(0, 12)
    .map((item) => `- [${item.kind}] ${item.title}${item.content ? `: ${item.content}` : ''}`)
    .join('\n');

  const system =
    'You help users document their working thread. Reply with only markdown, concise, concrete, and collaborative. Do not create tasks directly.';
  const user = [
    `Thread title: ${thread.title}`,
    '',
    'Current context:',
    contextLines || '(none)',
    '',
    'Current document:',
    thread.docMarkdown.slice(0, 6000) || '(empty)',
    '',
    'Relevant tasks:',
    taskLines || '(none)',
    '',
    kind === 'organize_context'
      ? 'Create a compact markdown block that organizes the current context into sections.'
      : kind === 'summarize_conclusion'
        ? 'Draft a short markdown conclusion block capturing the clearest current conclusion.'
        : 'Draft a short markdown block with 3 to 5 concrete next steps as bullet points.',
  ].join('\n');

  try {
    const text = await runOpenAiText(system, user);
    if (!text) return fallback;
    return {
      ...fallback,
      content: text,
    };
  } catch {
    return fallback;
  }
}

export function parseSuggestedNextSteps(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) =>
      line
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 6);
}
