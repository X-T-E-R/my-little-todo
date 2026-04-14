import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AI_PERSONAS, type AiPersona, isAiPersona } from '../ai/types';
import { getSetting, putSetting } from '../storage/settingsApi';

const PERSONA_UI_ORDER: AiPersona[] = AI_PERSONAS;

type AiEntryPreset = 'stream' | 'now' | 'thread';
type AiSuggestionDensity = 'focused' | 'balanced' | 'proactive';

function Toggle({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
      }`}
    >
      <span
        className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function ChoiceRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: readonly { id: T; label: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: value === option.id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
              color: value === option.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              border: `1px solid ${
                value === option.id ? 'var(--color-accent)' : 'var(--color-border)'
              }`,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AiAgentSettings() {
  const { t } = useTranslation(['ai', 'settings']);
  const { t: ts } = useTranslation('settings');
  const [confirmWrites, setConfirmWrites] = useState(true);
  const [persona, setPersona] = useState<AiPersona>('coach');
  const [entryPreset, setEntryPreset] = useState<AiEntryPreset>('stream');
  const [suggestionDensity, setSuggestionDensity] = useState<AiSuggestionDensity>('balanced');
  const [showContextHints, setShowContextHints] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([
      getSetting('ai-agent-confirm-writes'),
      getSetting('ai-agent-persona'),
      getSetting('ai-agent-default-entry'),
      getSetting('ai-agent-suggestion-density'),
      getSetting('ai-agent-show-context-hints'),
    ]).then(([confirmValue, personaValue, entryValue, densityValue, contextHintsValue]) => {
      setConfirmWrites(confirmValue !== 'false');
      setPersona(isAiPersona(personaValue) ? personaValue : 'coach');
      setEntryPreset(
        entryValue === 'now' || entryValue === 'thread' || entryValue === 'stream'
          ? entryValue
          : 'stream',
      );
      setSuggestionDensity(
        densityValue === 'focused' || densityValue === 'proactive' || densityValue === 'balanced'
          ? densityValue
          : 'balanced',
      );
      setShowContextHints(contextHintsValue !== 'false');
      setLoaded(true);
    });
  }, []);

  const saveConfirmWrites = async (next: boolean) => {
    setConfirmWrites(next);
    await putSetting('ai-agent-confirm-writes', next ? 'true' : 'false');
  };

  const savePersona = async (next: AiPersona) => {
    setPersona(next);
    await putSetting('ai-agent-persona', next);
  };

  const saveEntryPreset = async (next: AiEntryPreset) => {
    setEntryPreset(next);
    await putSetting('ai-agent-default-entry', next);
  };

  const saveSuggestionDensity = async (next: AiSuggestionDensity) => {
    setSuggestionDensity(next);
    await putSetting('ai-agent-suggestion-density', next);
  };

  const saveShowContextHints = async (next: boolean) => {
    setShowContextHints(next);
    await putSetting('ai-agent-show-context-hints', next ? 'true' : 'false');
  };

  if (!loaded) {
    return (
      <p className="text-xs text-[var(--color-text-tertiary)]">
        {t('Loading...', { ns: 'settings' })}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section
        className="rounded-[var(--radius-panel)] border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{t('AI role')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {ts(
            'Tune how the assistant sounds, where it shows up first, and how much guidance it gives by default.',
          )}
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">{t('AI role')}</p>
          <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{t('AI role hint')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PERSONA_UI_ORDER.map((id) => {
              const active = persona === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => void savePersona(id)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: active ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    border: active
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                  }}
                >
                  {t(`persona_${id}`)}
                </button>
              );
            })}
          </div>
        </div>

        <ChoiceRow
          label={ts('Default entry')}
          value={entryPreset}
          onChange={(next) => void saveEntryPreset(next)}
          options={[
            { id: 'stream', label: ts('Stream') },
            { id: 'now', label: ts('Now') },
            { id: 'thread', label: ts('Work thread') },
          ]}
        />

        <ChoiceRow
          label={ts('Suggestion density')}
          value={suggestionDensity}
          onChange={(next) => void saveSuggestionDensity(next)}
          options={[
            { id: 'focused', label: ts('Focused') },
            { id: 'balanced', label: ts('Balanced') },
            { id: 'proactive', label: ts('Proactive') },
          ]}
        />

        <div
          className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">{t('Confirm writes')}</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t('Confirm writes hint')}
            </p>
          </div>
          <Toggle checked={confirmWrites} onToggle={() => void saveConfirmWrites(!confirmWrites)} />
        </div>

        <div
          className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {ts('Show context hints')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {ts(
                'Surface recent role, task, and stream context before the assistant suggests actions.',
              )}
            </p>
          </div>
          <Toggle
            checked={showContextHints}
            onToggle={() => void saveShowContextHints(!showContextHints)}
          />
        </div>
      </section>
    </div>
  );
}
