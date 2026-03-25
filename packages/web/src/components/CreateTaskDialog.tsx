import type { DdlType } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Tag, User, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore, useStreamStore } from '../stores';

interface Props {
  open: boolean;
  onClose: () => void;
  initialTitle?: string;
}

const DDL_TYPES: { value: DdlType; label: string; hint: string }[] = [
  { value: 'hard', label: 'Hard', hint: 'Cannot postpone' },
  { value: 'commitment', label: 'Commitment', hint: 'Try to keep promise' },
  { value: 'soft', label: 'Flexible', hint: 'Can adjust' },
];

export function CreateTaskDialog({ open, onClose, initialTitle = '' }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState('');
  const [showBody, setShowBody] = useState(false);
  const [ddlStr, setDdlStr] = useState('');
  const [ddlType, setDdlType] = useState<DdlType>('commitment');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation('task');

  const addEntry = useStreamStore((s) => s.addEntry);
  const roles = useRoleStore((s) => s.roles);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const [roleId, setRoleId] = useState<string | undefined>(currentRoleId ?? undefined);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const parsedTags = tags
        .split(/[,，\s]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean);

      await addEntry(title.trim(), true, {
        ddl: ddlStr ? new Date(ddlStr) : undefined,
        ddlType: ddlStr ? ddlType : undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
        body: body.trim() || undefined,
        roleId: roleId || undefined,
      });
      setTitle('');
      setBody('');
      setShowBody(false);
      setDdlStr('');
      setTags('');
      setRoleId(currentRoleId ?? undefined);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed inset-x-4 top-[5%] sm:top-[20%] z-50 mx-auto max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                {t('Create Task')}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('Close')}
                className="rounded-lg p-1.5 transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <input
                // biome-ignore lint/a11y/noAutofocus: intentional for dialog UX
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) handleSubmit();
                }}
                placeholder={t('Task name')}
                className="w-full rounded-xl px-4 py-3 text-[15px] outline-none transition-colors"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />

              {!showBody ? (
                <button
                  type="button"
                  onClick={() => setShowBody(true)}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('+ Add note')}
                </button>
              ) : (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('Notes, ideas, checklists...')}
                  className="w-full resize-none rounded-xl px-4 py-2.5 text-sm leading-relaxed outline-none transition-colors"
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    minHeight: '60px',
                  }}
                  rows={2}
                />
              )}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    htmlFor="dlg-ddl"
                    className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    <Calendar size={14} />
                    {t('Due date')}
                  </label>
                  <input
                    id="dlg-ddl"
                    type="datetime-local"
                    value={ddlStr}
                    onChange={(e) => setDdlStr(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors"
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>

                {ddlStr && (
                  <div>
                    <p
                      className="mb-1.5 text-xs font-medium"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {t('DDL type')}
                    </p>
                    <div className="flex gap-1">
                      {DDL_TYPES.map((dt) => (
                        <button
                          key={dt.value}
                          type="button"
                          onClick={() => setDdlType(dt.value)}
                          title={t(dt.hint)}
                          className="rounded-lg px-2.5 py-2 text-xs font-medium transition-colors"
                          style={{
                            background:
                              ddlType === dt.value ? 'var(--color-accent)' : 'var(--color-bg)',
                            color: ddlType === dt.value ? 'white' : 'var(--color-text-secondary)',
                          }}
                        >
                          {t(dt.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="dlg-tags"
                  className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <Tag size={14} />
                  {t('Tags (space separated)')}
                </label>
                <input
                  id="dlg-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder={t('e.g. paper experiment')}
                  className="w-full rounded-xl px-4 py-2 text-sm outline-none transition-colors"
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              {roles.length > 0 && (
                <div>
                  <p
                    className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    <User size={14} />
                    {t('Role')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRoleId(undefined)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        background: !roleId ? 'var(--color-accent)' : 'var(--color-bg)',
                        color: !roleId ? 'white' : 'var(--color-text-secondary)',
                        border: '1px solid transparent',
                      }}
                    >
                      {t('None')}
                    </button>
                    {roles.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRoleId(r.id)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          background:
                            roleId === r.id
                              ? (r.color ?? 'var(--color-accent)')
                              : 'var(--color-bg)',
                          color: roleId === r.id ? 'white' : 'var(--color-text-secondary)',
                          border: roleId === r.id ? 'none' : '1px solid var(--color-border)',
                        }}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors"
                style={{
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!title.trim() || submitting}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                style={{ background: 'var(--color-accent)' }}
              >
                {submitting ? t('Creating...') : t('Create')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
