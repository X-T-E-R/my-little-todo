import { stepCountIs, streamText } from 'ai';
import { createChatModel, resolveAiConfig } from './aiConfig';
import { buildSystemPrompt } from './aiPrompts';
import { buildAiTools } from './aiTools';
import type { AiPersona, AiPreset, PendingWrite } from './types';

export class NoAiConfigError extends Error {
  constructor() {
    super('NO_AI_CONFIG');
    this.name = 'NoAiConfigError';
  }
}

export interface RunAgentStreamOptions {
  preset: AiPreset;
  persona: AiPersona;
  focusRoleName?: string | null;
  /** Conversation without system (system is added via `system` on streamText). */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  confirmWrites: boolean;
  onPendingWrite?: (p: PendingWrite) => void;
  abortSignal?: AbortSignal;
}

/**
 * Streaming agent with MCP-mirrored tools (executed in the client stores).
 */
export async function runAgentStream(options: RunAgentStreamOptions) {
  const config = await resolveAiConfig();
  if (!config) {
    throw new NoAiConfigError();
  }

  const model = createChatModel(config);
  const tools = buildAiTools({
    confirmWrites: options.confirmWrites,
    onPendingWrite: options.onPendingWrite,
  });

  return streamText({
    model,
    system: buildSystemPrompt({
      preset: options.preset,
      persona: options.persona,
      focusRoleName: options.focusRoleName,
    }),
    messages: options.messages,
    tools,
    stopWhen: stepCountIs(8),
    abortSignal: options.abortSignal,
  });
}
