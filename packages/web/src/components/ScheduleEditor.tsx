import { generateId } from '@my-little-todo/core';
import { motion } from 'framer-motion';
import { Clock, MapPin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduleBlock } from '../stores/scheduleStore';
import { useScheduleStore } from '../stores/scheduleStore';

const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRESET_COLORS = [
  '#6b8cce', '#5eb376', '#e8a05c', '#d96c6c', '#9b7ed8',
  '#4ecdc4', '#f0c040', '#ff6b9d', '#45b7d1', '#96ceb4',
];

function BlockCard({
  block,
  onUpdate,
  onRemove,
}: {
  block: ScheduleBlock;
  onUpdate: (b: ScheduleBlock) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('calendar');
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <BlockEditor
        block={block}
        onSave={(b) => {
          onUpdate(b);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className="rounded-xl p-3 transition-colors hover:shadow-sm"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${block.color}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {block.name}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            <Clock size={10} />
            <span>{block.startTime} - {block.endTime}</span>
            {block.location && (
              <>
                <MapPin size={10} />
                <span>{block.location}</span>
              </>
            )}
          </div>
          <div className="mt-1.5 flex gap-1">
            {block.daysOfWeek.map((d) => (
              <span
                key={d}
                className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                style={{ background: `${block.color}20`, color: block.color }}
              >
                {t(WEEKDAY_KEYS[d]!)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-1 text-[11px] font-medium"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {t('Edit')}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 transition-colors"
            style={{ color: 'var(--color-danger)' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  onSave,
  onCancel,
}: {
  block?: ScheduleBlock;
  onSave: (b: ScheduleBlock) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('calendar');
  const [name, setName] = useState(block?.name ?? '');
  const [startTime, setStartTime] = useState(block?.startTime ?? '08:00');
  const [endTime, setEndTime] = useState(block?.endTime ?? '09:40');
  const [days, setDays] = useState<number[]>(block?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [color, setColor] = useState(block?.color ?? PRESET_COLORS[0] ?? '#6b8cce');
  const [location, setLocation] = useState(block?.location ?? '');

  const toggleDay = (d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const handleSave = () => {
    if (!name.trim() || days.length === 0) return;
    onSave({
      id: block?.id ?? generateId('sch'),
      name: name.trim(),
      color,
      startTime,
      endTime,
      recurrence: 'weekly',
      daysOfWeek: days,
      exceptions: block?.exceptions ?? [],
      location: location.trim() || undefined,
      roleId: block?.roleId,
    });
  };

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('Course/Event name')}
        className="w-full bg-transparent text-sm font-semibold outline-none"
        style={{ color: 'var(--color-text)' }}
      />

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('Start')}
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg px-2 py-1.5 text-[12px] outline-none"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('End')}
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-lg px-2 py-1.5 text-[12px] outline-none"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Location (optional)')}
        </label>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={t('Classroom/Office...')}
          className="w-full rounded-lg px-2 py-1.5 text-[12px] outline-none"
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        />
      </div>

      <div>
        <label className="text-[10px] font-medium block mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Repeat days')}
        </label>
        <div className="flex gap-1">
          {WEEKDAY_KEYS.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleDay(i)}
              className="rounded-lg w-8 h-8 text-[11px] font-bold transition-colors"
              style={{
                background: days.includes(i) ? color : 'var(--color-bg)',
                color: days.includes(i) ? 'white' : 'var(--color-text-tertiary)',
                border: days.includes(i) ? 'none' : '1px solid var(--color-border)',
              }}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-medium block mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Color')}
        </label>
        <div className="flex gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="w-5 h-5 rounded-full transition-transform"
              style={{
                background: c,
                outline: color === c ? `2px solid ${c}` : 'none',
                outlineOffset: '2px',
                transform: color === c ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[11px] font-medium"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t('Cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || days.length === 0}
          className="rounded-lg px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--color-accent)' }}
        >
          {t('Save')}
        </button>
      </div>
    </div>
  );
}

export function ScheduleEditor() {
  const { t } = useTranslation('calendar');
  const { blocks, addBlock, updateBlock, removeBlock } = useScheduleStore();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {t('Schedule')}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('Add class schedule, check-in times and other fixed arrangements. The recommendation engine will avoid these time slots.')}
          </p>
        </div>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white"
            style={{ background: 'var(--color-accent)' }}
          >
            <Plus size={12} />
            {t('Add')}
          </button>
        )}
      </div>

      {showAdd && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <BlockEditor
            onSave={(b) => {
              addBlock(b);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </motion.div>
      )}

      {blocks.length === 0 && !showAdd && (
        <div
          className="rounded-xl py-8 text-center"
          style={{ border: '1px dashed var(--color-border)' }}
        >
          <p className="text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('No fixed arrangements yet')}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('Click Add above to create your class or schedule')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {blocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            onUpdate={updateBlock}
            onRemove={() => removeBlock(block.id)}
          />
        ))}
      </div>
    </div>
  );
}
