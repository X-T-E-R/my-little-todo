import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Loader2, Send, Sparkles, Square, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiChatStore } from '../ai/aiChatStore';
import { AI_PERSONAS, type AiPersona, type AiPreset, isAiPersona } from '../ai/types';
import { useModuleStore } from '../modules';
import { getSetting } from '../storage/settingsApi';
import { useRoleStore } from '../stores/roleStore';

const PRESETS: { id: AiPreset; labelKey: string }[] = [
  { id: 'general', labelKey: 'preset_general' },
  { id: 'daily_review', labelKey: 'preset_daily_review' },
  { id: 'stream_triage', labelKey: 'preset_stream_triage' },
  { id: 'planning', labelKey: 'preset_planning' },
  { id: 'magic', labelKey: 'preset_magic' },
];

const PERSONAS: AiPersona[] = AI_PERSONAS;

export function AiChatPanel({ showLauncher = true }: { showLauncher?: boolean }) {
  const { t } = useTranslation('ai');
  const enabled = useModuleStore((s) => s.isEnabled('ai-agent'));
  const open = useAiChatStore((s) => s.open);
  const setOpen = useAiChatStore((s) => s.setOpen);
  const preset = useAiChatStore((s) => s.preset);
  const setPreset = useAiChatStore((s) => s.setPreset);
  const persona = useAiChatStore((s) => s.persona);
  const setPersona = useAiChatStore((s) => s.setPersona);
  const messages = useAiChatStore((s) => s.messages);
  const pendingWrites = useAiChatStore((s) => s.pendingWrites);
  const streaming = useAiChatStore((s) => s.streaming);
  const error = useAiChatStore((s) => s.error);
  const partialAssistant = useAiChatStore((s) => s.partialAssistant);
  const sendUserMessage = useAiChatStore((s) => s.sendUserMessage);
  const stop = useAiChatStore((s) => s.stop);
  const clearChat = useAiChatStore((s) => s.clearChat);
  const confirmPending = useAiChatStore((s) => s.confirmPending);
  const dismissPending = useAiChatStore((s) => s.dismissPending);
  const focusedRoleId = useRoleStore((s) => s.currentRoleId);
  const roles = useRoleStore((s) => s.roles);

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync persona from settings when panel mounts.
  useEffect(() => {
    void getSetting('ai-agent-persona').then((v) => {
      if (isAiPersona(v)) setPersona(v);
    });
  }, [setPersona]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on any chat update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialAssistant, pendingWrites.length]);

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    await sendUserMessage(text);
  }, [input, streaming, sendUserMessage]);

  const focusedRole = roles.find((r) => r.id === focusedRoleId);

  if (!enabled) return null;

  return (
    <>
      {!open && showLauncher && (
        <button
          type="button"
          aria-label={t('Open AI chat')}
          onClick={() => setOpen(true)}
          className="fixed z-[120] flex h-11 w-11 items-center justify-center rounded-2xl border shadow-md transition-transform hover:scale-[1.03] active:scale-95"
          style={{
            bottom: 'calc(92px + var(--safe-area-bottom))',
            right: 'calc(16px + var(--safe-area-right))',
            background: 'color-mix(in oklab, var(--color-surface) 94%, white 6%)',
            borderColor: 'color-mix(in oklab, var(--color-border) 70%, var(--color-accent) 30%)',
            color: 'var(--color-accent)',
          }}
        >
          <Bot size={18} />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed z-[130] flex max-h-[min(600px,82vh)] w-[min(430px,94vw)] flex-col overflow-hidden rounded-3xl border shadow-2xl"
            style={{
              bottom: 'calc(96px + var(--safe-area-bottom))',
              right: 'calc(16px + var(--safe-area-right))',
              background: 'color-mix(in oklab, var(--color-surface) 92%, white 8%)',
              borderColor: 'color-mix(in oklab, var(--color-border) 70%, var(--color-accent) 30%)',
            }}
          >
            <div
              className="flex items-center justify-between gap-2 border-b px-3 py-2.5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-xl"
                  style={{ background: 'var(--color-accent-soft)' }}
                >
                  <Sparkles size={14} className="text-[var(--color-accent)]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t('AI assistant')}</p>
                  {focusedRole && (
                    <p className="truncate text-[10px] text-[var(--color-text-tertiary)]">
                      {t('Focused role')}: {focusedRole.name}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg p-1.5 hover:bg-[var(--color-bg)]"
                  onClick={() => clearChat()}
                  title={t('Clear')}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 hover:bg-[var(--color-bg)]"
                  onClick={() => setOpen(false)}
                  title={t('Close')}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div
              className="space-y-2 border-b px-3 py-2"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  {t('AI role')}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {PERSONAS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      disabled={streaming}
                      onClick={() => setPersona(id)}
                      className="rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors"
                      style={{
                        background: persona === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                        color:
                          persona === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        border:
                          persona === id
                            ? '1px solid var(--color-accent)'
                            : '1px solid var(--color-border)',
                      }}
                    >
                      {t(`persona_${id}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  {t('Preset')}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={streaming}
                      onClick={() => setPreset(p.id)}
                      className="rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors"
                      style={{
                        background:
                          preset === p.id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                        color:
                          preset === p.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        border:
                          preset === p.id
                            ? '1px solid var(--color-accent)'
                            : '1px solid var(--color-border)',
                      }}
                    >
                      {t(p.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {messages.length === 0 && !streaming && (
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {t('Message placeholder')}
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user' ? 'ml-auto' : 'mr-auto'
                  }`}
                  style={{
                    background: m.role === 'user' ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {m.content}
                </div>
              ))}
              {streaming && partialAssistant && (
                <div
                  className="mr-auto max-w-[86%] rounded-2xl border px-3 py-2 text-sm leading-relaxed"
                  style={{
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  {partialAssistant}
                  <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[var(--color-accent)] align-middle" />
                </div>
              )}
              {streaming && !partialAssistant && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                  <Loader2 size={14} className="animate-spin" />
                  {t('Thinking…')}
                </div>
              )}

              {pendingWrites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">
                    {t('Pending confirmation')}
                  </p>
                  {pendingWrites.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col gap-2 rounded-xl border px-2.5 py-2 text-xs"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
                    >
                      <p className="text-[var(--color-text-secondary)]">{p.summary}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white"
                          style={{ background: 'var(--color-accent)' }}
                          onClick={() => void confirmPending(p.id)}
                        >
                          {t('Confirm')}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border px-3 py-1.5 text-xs"
                          style={{ borderColor: 'var(--color-border)' }}
                          onClick={() => dismissPending(p.id)}
                        >
                          {t('Dismiss')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error === 'NO_AI_CONFIG' && (
                <p className="text-xs text-[var(--color-danger)]">{t('No API key')}</p>
              )}
              {error && error !== 'NO_AI_CONFIG' && (
                <p className="text-xs text-[var(--color-danger)]">
                  {t('Error')}: {error}
                </p>
              )}
              <div ref={bottomRef} />
            </div>

            <div
              className="flex items-end gap-2 border-t p-2"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
                placeholder={t('Message placeholder')}
                rows={2}
                className="min-h-[44px] flex-1 resize-none rounded-2xl border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              {streaming ? (
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                  style={{ borderColor: 'var(--color-border)' }}
                  onClick={() => stop()}
                  title={t('Stop')}
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-40"
                  style={{ background: 'var(--color-accent)' }}
                  onClick={() => void onSend()}
                  title={t('Send')}
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
