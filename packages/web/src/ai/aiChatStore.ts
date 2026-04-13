import { create } from 'zustand';
import { getSetting, putSetting } from '../storage/settingsApi';
import { useRoleStore } from '../stores/roleStore';
import { NoAiConfigError, runAgentStream } from './aiAgent';
import { applyWriteAction } from './aiTools';
import { type AiPersona, type AiPreset, type PendingWrite, isAiPersona } from './types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AiChatState {
  open: boolean;
  preset: AiPreset;
  persona: AiPersona;
  messages: ChatMessage[];
  pendingWrites: PendingWrite[];
  streaming: boolean;
  error: string | null;
  partialAssistant: string;
  abortController: AbortController | null;

  setOpen: (open: boolean) => void;
  setPreset: (p: AiPreset) => void;
  setPersona: (persona: AiPersona) => void;
  /** Open panel and optionally set preset + seed message. */
  openWithPreset: (preset: AiPreset, seedUserMessage?: string) => void;
  sendUserMessage: (text: string) => Promise<void>;
  stop: () => void;
  clearChat: () => void;
  confirmPending: (id: string) => Promise<void>;
  dismissPending: (id: string) => void;
}

async function resolveChatPreferences(currentPersona: AiPersona) {
  const [confirmValue, personaValue] = await Promise.all([
    getSetting('ai-agent-confirm-writes'),
    getSetting('ai-agent-persona'),
  ]);

  return {
    confirmWrites: confirmValue !== 'false',
    persona: isAiPersona(personaValue) ? personaValue : currentPersona,
  };
}

function appendAssistantMessage(
  set: (partial: Partial<AiChatState> | ((state: AiChatState) => Partial<AiChatState>)) => void,
  finalText: string,
) {
  set((state) => ({
    messages: [
      ...state.messages,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalText || '(empty)',
      },
    ],
    partialAssistant: '',
    streaming: false,
    abortController: null,
  }));
}

function resetStreamingState(set: (partial: Partial<AiChatState>) => void) {
  set({ streaming: false, abortController: null, partialAssistant: '' });
}

function toChatErrorMessage(error: unknown) {
  if (error instanceof NoAiConfigError) {
    return 'NO_AI_CONFIG';
  }
  return String(error);
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  open: false,
  preset: 'general',
  persona: 'coach',
  messages: [],
  pendingWrites: [],
  streaming: false,
  error: null,
  partialAssistant: '',
  abortController: null,

  setOpen: (open) => set({ open }),
  setPreset: (preset) => set({ preset }),
  setPersona: (persona) => {
    set({ persona });
    void putSetting('ai-agent-persona', persona);
  },

  openWithPreset: (preset, seedUserMessage) => {
    set({ open: true, preset, error: null });
    if (seedUserMessage?.trim()) {
      void get().sendUserMessage(seedUserMessage.trim());
    }
  },

  clearChat: () => set({ messages: [], partialAssistant: '', error: null, pendingWrites: [] }),

  stop: () => {
    get().abortController?.abort();
    set({ streaming: false, abortController: null });
  },

  sendUserMessage: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    set((s) => ({
      messages: [...s.messages, { id: crypto.randomUUID(), role: 'user', content: trimmed }],
      error: null,
      partialAssistant: '',
      streaming: true,
    }));

    const controller = new AbortController();
    set({ abortController: controller });

    const { confirmWrites, persona: effectivePersona } = await resolveChatPreferences(
      get().persona,
    );
    if (effectivePersona !== get().persona) {
      set({ persona: effectivePersona });
    }

    const history = get().messages.map((m) => ({ role: m.role, content: m.content }));
    const roleState = useRoleStore.getState();
    const focusedRole = roleState.roles.find((r) => r.id === roleState.currentRoleId);

    try {
      const result = await runAgentStream({
        preset: get().preset,
        persona: effectivePersona,
        focusRoleName: focusedRole?.name,
        messages: history,
        confirmWrites,
        onPendingWrite: (p) => {
          useAiChatStore.setState((s) => ({ pendingWrites: [...s.pendingWrites, p] }));
        },
        abortSignal: controller.signal,
      });

      let acc = '';
      for await (const delta of result.textStream) {
        acc += delta;
        set({ partialAssistant: acc });
      }

      appendAssistantMessage(set, acc.trim() || (await result.text));
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err.name === 'AbortError') {
        resetStreamingState(set);
        return;
      }
      set({
        error: toChatErrorMessage(e),
        streaming: false,
        abortController: null,
        partialAssistant: '',
      });
    }
  },

  confirmPending: async (id) => {
    const p = get().pendingWrites.find((x) => x.id === id);
    if (!p) return;
    try {
      const out = await applyWriteAction(p.kind, p.payload);
      set((s) => ({
        pendingWrites: s.pendingWrites.filter((x) => x.id !== id),
        messages: [
          ...s.messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Confirmed: ${p.summary}\n${out}`,
          },
        ],
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  dismissPending: (id) => {
    set((s) => ({
      pendingWrites: s.pendingWrites.filter((x) => x.id !== id),
    }));
  },
}));
