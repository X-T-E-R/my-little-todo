/** Preset system prompts for the agent. */
export type AiPreset = 'general' | 'daily_review' | 'stream_triage' | 'planning' | 'magic';

/** Conversation style / behavior profile for the assistant. */
export type AiPersona = 'coach' | 'planner' | 'analyst' | 'buddy';

export const AI_PERSONAS: AiPersona[] = ['coach', 'planner', 'analyst', 'buddy'];

export function isAiPersona(value: string | null | undefined): value is AiPersona {
  return !!value && AI_PERSONAS.includes(value as AiPersona);
}

export type PendingWriteKind =
  | 'create_task'
  | 'update_task'
  | 'delete_task'
  | 'add_stream'
  | 'update_stream_entry'
  | 'manage_role';

export interface PendingWrite {
  id: string;
  kind: PendingWriteKind;
  /** Human-readable summary for the confirmation UI */
  summary: string;
  /** Original tool arguments (JSON-serializable) */
  payload: Record<string, unknown>;
}

export type ResolvedAiConfig =
  | {
      mode: 'direct';
      baseURL: string;
      apiKey: string;
      model: string;
    }
  | {
      mode: 'proxy';
      baseURL: string;
      /** Bearer token for our server proxy */
      apiKey: string;
      model: string;
    };
