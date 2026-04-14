import type { WorkThreadInterruptSource, WorkThreadWaitingCondition } from '@my-little-todo/core';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type WorkThreadInlineCardKind =
  | 'next-action'
  | 'waiting'
  | 'interrupt'
  | 'note-context'
  | 'link-context'
  | 'checkpoint';

export interface WorkThreadInlineCardState {
  kind: WorkThreadInlineCardKind;
  anchor: {
    left: number;
    top: number;
  };
}

const WAITING_KIND_OPTIONS: WorkThreadWaitingCondition['kind'][] = [
  'person',
  'tool',
  'file',
  'time',
  'external',
];

export function WorkThreadInlineCards({
  activeCard,
  onClose,
  onAddNextAction,
  onAddWaiting,
  onCaptureInterrupt,
  onAddNoteContext,
  onAddLinkContext,
  onSaveCheckpoint,
  onInsertMarkdown,
}: {
  activeCard: WorkThreadInlineCardState | null;
  onClose: () => void;
  onAddNextAction: (text: string) => Promise<void>;
  onAddWaiting: (
    title: string,
    kind: WorkThreadWaitingCondition['kind'],
    detail?: string,
  ) => Promise<void>;
  onCaptureInterrupt: (
    title: string,
    content?: string,
    source?: WorkThreadInterruptSource,
  ) => Promise<void>;
  onAddNoteContext: (title: string, content?: string) => Promise<void>;
  onAddLinkContext: (title: string, url: string) => Promise<void>;
  onSaveCheckpoint: () => Promise<void>;
  onInsertMarkdown: (markdown: string) => void;
}) {
  const { t } = useTranslation('think');
  const [line, setLine] = useState('');
  const [detail, setDetail] = useState('');
  const [waitingKind, setWaitingKind] =
    useState<WorkThreadWaitingCondition['kind']>('external');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLine('');
    setDetail('');
    setWaitingKind('external');
    if (activeCard?.kind !== 'checkpoint') {
      window.setTimeout(() => titleRef.current?.focus(), 40);
    }
  }, [activeCard]);

  if (!activeCard) return null;

  const isCheckpoint = activeCard.kind === 'checkpoint';
  const left = Math.min(Math.max(12, activeCard.anchor.left), 520);
  const top = Math.max(24, activeCard.anchor.top + 6);
  const cardTitles: Record<WorkThreadInlineCardKind, string> = {
    'next-action': t('thread_inline_title_next_action'),
    waiting: t('thread_inline_title_waiting'),
    interrupt: t('thread_inline_title_interrupt'),
    'note-context': t('thread_inline_title_note_context'),
    'link-context': t('thread_inline_title_link_context'),
    checkpoint: t('thread_inline_title_checkpoint'),
  };

  return (
    <div
      className="absolute z-[60] w-[min(360px,calc(100%-1.5rem))] rounded-[24px] border p-3 shadow-2xl"
      style={{
        left,
        top,
        borderColor: 'var(--color-border)',
        background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))',
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {cardTitles[activeCard.kind]}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <X size={14} />
        </button>
      </div>

      {isCheckpoint ? (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('thread_inline_checkpoint_hint')}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-3 py-2 text-xs font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t('thread_inline_cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                void onSaveCheckpoint();
                onInsertMarkdown(`\n\n## Checkpoint\n\n- Saved at ${new Date().toLocaleString()}\n`);
                onClose();
              }}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
              style={{ background: 'var(--color-accent)' }}
            >
              {t('thread_inline_checkpoint_submit')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            ref={titleRef}
            value={line}
            onChange={(event) => setLine(event.target.value)}
            placeholder={t('thread_inline_title_placeholder')}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />

          {activeCard.kind === 'waiting' ? (
            <select
              value={waitingKind}
              onChange={(event) =>
                setWaitingKind(event.target.value as WorkThreadWaitingCondition['kind'])
              }
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {WAITING_KIND_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`thread_waiting_kind_${kind}`)}
                </option>
              ))}
            </select>
          ) : null}

          {activeCard.kind !== 'next-action' ? (
            <textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              rows={3}
              placeholder={
                activeCard.kind === 'link-context'
                  ? t('thread_inline_link_placeholder')
                  : t('thread_inline_detail_placeholder')
              }
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-3 py-2 text-xs font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t('thread_inline_cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                const trimmedLine = line.trim();
                const trimmedDetail = detail.trim();
                if (!trimmedLine) return;
                if (activeCard.kind === 'next-action') {
                  onInsertMarkdown(`- [ ] ${trimmedLine}`);
                  void onAddNextAction(trimmedLine);
                }
                if (activeCard.kind === 'waiting') {
                  onInsertMarkdown(
                    `> [!waiting:${waitingKind}] ${trimmedLine}${
                      trimmedDetail ? `\n> ${trimmedDetail.split('\n').join('\n> ')}` : ''
                    }`,
                  );
                  void onAddWaiting(trimmedLine, waitingKind, trimmedDetail || undefined);
                }
                if (activeCard.kind === 'interrupt') {
                  onInsertMarkdown(
                    `> [!interrupt:manual] ${trimmedLine}${
                      trimmedDetail ? `\n> ${trimmedDetail.split('\n').join('\n> ')}` : ''
                    }`,
                  );
                  void onCaptureInterrupt(trimmedLine, trimmedDetail || undefined, 'manual');
                }
                if (activeCard.kind === 'note-context') {
                  onInsertMarkdown(`\n### ${trimmedLine}\n\n${trimmedDetail}`);
                  void onAddNoteContext(trimmedLine, trimmedDetail || undefined);
                }
                if (activeCard.kind === 'link-context') {
                  onInsertMarkdown(`[${trimmedLine}](${trimmedDetail})`);
                  void onAddLinkContext(trimmedLine, trimmedDetail);
                }
                onClose();
              }}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
              style={{ background: 'var(--color-accent)' }}
            >
              {t('thread_inline_insert')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
