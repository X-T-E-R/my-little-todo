import type { Role, StreamEntryType } from '@my-little-todo/core';
import type { TFunction } from 'i18next';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type FilterCondition,
  type FilterField,
  type FilterGroupNode,
  type FilterNode,
  type FilterOp,
  createDefaultCondition,
  createEmptyGroup,
  createEmptyRoot,
  newFilterId,
} from '../stores/streamFilterStore';

function newId(): string {
  return newFilterId();
}

function opsForField(field: FilterField): FilterOp[] {
  switch (field) {
    case 'type':
      return ['is', 'is_not'];
    case 'tag':
      return ['contains', 'not_contains', 'is', 'is_not'];
    case 'content':
      return ['contains', 'not_contains'];
    case 'date':
      return ['before', 'after', 'between'];
    case 'role':
      return ['is', 'is_not'];
    default:
      return ['contains'];
  }
}

function removeNode(root: FilterGroupNode, id: string): FilterGroupNode {
  if (id === 'root') return createEmptyRoot();
  return {
    ...root,
    children: root.children
      .filter((ch) => ch.id !== id)
      .map((ch) => (ch.type === 'group' ? removeNode(ch, id) : ch)),
  };
}

function addChild(root: FilterGroupNode, parentId: string, node: FilterNode): FilterGroupNode {
  if (root.id === parentId) {
    return { ...root, children: [...root.children, node] };
  }
  return {
    ...root,
    children: root.children.map((ch) => (ch.type === 'group' ? addChild(ch, parentId, node) : ch)),
  };
}

function updateConditionInTree(
  root: FilterGroupNode,
  id: string,
  patch: Partial<FilterCondition>,
): FilterGroupNode {
  const walk = (node: FilterNode): FilterNode => {
    if (node.type === 'condition' && node.condition.id === id) {
      const next = { ...node.condition, ...patch };
      const field = patch.field ?? node.condition.field;
      const allowed = opsForField(field);
      if (!allowed.includes(next.op)) {
        next.op = allowed[0];
      }
      return { ...node, condition: next };
    }
    if (node.type === 'group') {
      return { ...node, children: node.children.map(walk) };
    }
    return node;
  };
  return walk(root) as FilterGroupNode;
}

function setGroupInTree(
  root: FilterGroupNode,
  id: string,
  patch: Partial<Pick<FilterGroupNode, 'logic' | 'negate'>>,
): FilterGroupNode {
  const walk = (node: FilterNode): FilterNode => {
    if (node.type === 'group') {
      if (node.id === id) return { ...node, ...patch };
      return { ...node, children: node.children.map(walk) };
    }
    return node;
  };
  return walk(root) as FilterGroupNode;
}

export function AdvancedFilterPanel({
  root,
  onChange,
  availableTags,
  roles,
  onClear,
  onClose,
}: {
  root: FilterGroupNode;
  onChange: (next: FilterGroupNode) => void;
  availableTags: string[];
  roles: Role[];
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('stream');

  const updateCondition = useCallback(
    (id: string, patch: Partial<FilterCondition>) => {
      onChange(updateConditionInTree(root, id, patch));
    },
    [onChange, root],
  );

  const updateGroup = useCallback(
    (id: string, patch: Partial<Pick<FilterGroupNode, 'logic' | 'negate'>>) => {
      onChange(setGroupInTree(root, id, patch));
    },
    [onChange, root],
  );

  const addCondition = (parentId: string) => {
    const cid = newId();
    const cond: FilterNode = {
      type: 'condition',
      id: cid,
      condition: { ...createDefaultCondition(), id: cid },
    };
    onChange(addChild(root, parentId, cond));
  };

  const addGroup = (parentId: string) => {
    const g = createEmptyGroup();
    onChange(addChild(root, parentId, g));
  };

  const remove = (id: string) => {
    onChange(removeNode(root, id));
  };

  return (
    <div
      className="rounded-2xl border p-3 shadow-lg space-y-3 max-h-[min(70vh,420px)] overflow-y-auto"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
          {t('Advanced filter')}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onClear();
            }}
            className="text-[11px] font-medium"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {t('Clear all filters')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-medium rounded-lg px-2 py-1"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
          >
            {t('Done')}
          </button>
        </div>
      </div>

      <GroupBlock
        node={root}
        depth={0}
        availableTags={availableTags}
        roles={roles}
        onUpdateCondition={updateCondition}
        onUpdateGroup={updateGroup}
        onAddCondition={addCondition}
        onAddGroup={addGroup}
        onRemove={remove}
        t={t}
      />
    </div>
  );
}

function GroupBlock({
  node,
  depth,
  availableTags,
  roles,
  onUpdateCondition,
  onUpdateGroup,
  onAddCondition,
  onAddGroup,
  onRemove,
  t,
}: {
  node: FilterGroupNode;
  depth: number;
  availableTags: string[];
  roles: Role[];
  onUpdateCondition: (id: string, patch: Partial<FilterCondition>) => void;
  onUpdateGroup: (id: string, patch: Partial<Pick<FilterGroupNode, 'logic' | 'negate'>>) => void;
  onAddCondition: (parentId: string) => void;
  onAddGroup: (parentId: string) => void;
  onRemove: (id: string) => void;
  t: TFunction<'stream'>;
}) {
  const pad = depth * 12;
  return (
    <div style={{ marginLeft: pad }}>
      {node.id !== 'root' && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label
            className="flex items-center gap-1 text-[11px]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <input
              type="checkbox"
              checked={node.negate}
              onChange={(e) => onUpdateGroup(node.id, { negate: e.target.checked })}
            />
            {t('NOT')}
          </label>
          <select
            value={node.logic}
            onChange={(e) => onUpdateGroup(node.id, { logic: e.target.value as 'AND' | 'OR' })}
            className="rounded-lg border px-2 py-1 text-[11px] bg-[var(--color-bg)]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <option value="AND">{t('AND')}</option>
            <option value="OR">{t('OR')}</option>
          </select>
          <button
            type="button"
            onClick={() => onRemove(node.id)}
            className="p-1 rounded"
            style={{ color: 'var(--color-danger, #ef4444)' }}
            aria-label={t('Remove group')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {node.id === 'root' && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('Match')}
          </span>
          <select
            value={node.logic}
            onChange={(e) => onUpdateGroup('root', { logic: e.target.value as 'AND' | 'OR' })}
            className="rounded-lg border px-2 py-1 text-[11px] bg-[var(--color-bg)]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <option value="AND">{t('all conditions (AND)')}</option>
            <option value="OR">{t('any condition (OR)')}</option>
          </select>
        </div>
      )}

      <div className="space-y-2">
        {node.children.map((ch, idx) => (
          <div key={ch.id}>
            {idx > 0 && (
              <div
                className="text-[10px] py-1 text-center font-medium"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {node.logic}
              </div>
            )}
            {ch.type === 'condition' ? (
              <ConditionRow
                condition={ch.condition}
                availableTags={availableTags}
                roles={roles}
                onChange={(patch) => onUpdateCondition(ch.condition.id, patch)}
                onRemove={() => onRemove(ch.id)}
                t={t}
              />
            ) : (
              <div
                className="rounded-xl border p-2 space-y-2"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <GroupBlock
                  node={ch}
                  depth={depth + 1}
                  availableTags={availableTags}
                  roles={roles}
                  onUpdateCondition={onUpdateCondition}
                  onUpdateGroup={onUpdateGroup}
                  onAddCondition={onAddCondition}
                  onAddGroup={onAddGroup}
                  onRemove={onRemove}
                  t={t}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          onClick={() => onAddCondition(node.id)}
          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <Plus size={12} /> {t('Add condition')}
        </button>
        <button
          type="button"
          onClick={() => onAddGroup(node.id)}
          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <Plus size={12} /> {t('Add group')}
        </button>
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  availableTags,
  roles,
  onChange,
  onRemove,
  t,
}: {
  condition: FilterCondition;
  availableTags: string[];
  roles: Role[];
  onChange: (patch: Partial<FilterCondition>) => void;
  onRemove: () => void;
  t: TFunction<'stream'>;
}) {
  const ops = opsForField(condition.field);
  const fieldOptions: { v: FilterField; label: string }[] = [
    { v: 'type', label: t('Field type') },
    { v: 'tag', label: t('Field tag') },
    { v: 'content', label: t('Field content') },
    { v: 'date', label: t('Field date') },
    { v: 'role', label: t('Field role') },
  ];

  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded-xl p-2"
      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex flex-col gap-0.5 min-w-[90px]">
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Field')}
        </span>
        <select
          value={condition.field}
          onChange={(e) => onChange({ field: e.target.value as FilterField })}
          className="rounded-lg border px-2 py-1 text-[11px] max-w-[120px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {fieldOptions.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-0.5 min-w-[100px]">
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Operator')}
        </span>
        <select
          value={condition.op}
          onChange={(e) => onChange({ op: e.target.value as FilterOp })}
          className="rounded-lg border px-2 py-1 text-[11px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {t(`op_${op}`)}
            </option>
          ))}
        </select>
      </div>

      <ValueInputs
        condition={condition}
        availableTags={availableTags}
        roles={roles}
        onChange={onChange}
        t={t}
      />

      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded-lg self-end mb-0.5"
        style={{ color: 'var(--color-danger, #ef4444)' }}
        aria-label={t('Remove condition')}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function ValueInputs({
  condition,
  availableTags,
  roles,
  onChange,
  t,
}: {
  condition: FilterCondition;
  availableTags: string[];
  roles: Role[];
  onChange: (patch: Partial<FilterCondition>) => void;
  t: TFunction<'stream'>;
}) {
  if (condition.field === 'type') {
    const v = (condition.value || 'spark') as StreamEntryType;
    return (
      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Value')}
        </span>
        <select
          value={v}
          onChange={(e) => onChange({ value: e.target.value })}
          className="rounded-lg border px-2 py-1 text-[11px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <option value="spark">{t('Inspiration')}</option>
          <option value="task">{t('Task')}</option>
          <option value="log">{t('Log')}</option>
        </select>
      </div>
    );
  }

  if (condition.field === 'role') {
    return (
      <div className="flex flex-col gap-0.5 min-w-[140px]">
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Value')}
        </span>
        <select
          value={condition.value || '__none__'}
          onChange={(e) => onChange({ value: e.target.value })}
          className="rounded-lg border px-2 py-1 text-[11px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <option value="__none__">{t('No role')}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (condition.field === 'date') {
    if (condition.op === 'between') {
      return (
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10px] font-medium"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t('From date')}
            </span>
            <input
              type="date"
              value={condition.value}
              onChange={(e) => onChange({ value: e.target.value })}
              className="rounded-lg border px-2 py-1 text-[11px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10px] font-medium"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t('To date')}
            </span>
            <input
              type="date"
              value={condition.value2 ?? ''}
              onChange={(e) => onChange({ value2: e.target.value })}
              className="rounded-lg border px-2 py-1 text-[11px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-0.5 min-w-[140px]">
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Date')}
        </span>
        <input
          type="date"
          value={condition.value}
          onChange={(e) => onChange({ value: e.target.value })}
          className="rounded-lg border px-2 py-1 text-[11px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        />
      </div>
    );
  }

  if (condition.field === 'tag' && availableTags.length > 0) {
    return (
      <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('Value')}
        </span>
        <input
          type="text"
          list={`taglist-${condition.id}`}
          value={condition.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={t('Tag or #name')}
          className="rounded-lg border px-2 py-1 text-[11px] w-full"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        />
        <datalist id={`taglist-${condition.id}`}>
          {availableTags.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
      <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
        {t('Value')}
      </span>
      <input
        type="text"
        value={condition.value}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder={t('Text')}
        className="rounded-lg border px-2 py-1 text-[11px] w-full min-w-[100px]"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      />
    </div>
  );
}
