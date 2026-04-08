import type { StreamEntry, StreamEntryType } from '@my-little-todo/core';
import { create } from 'zustand';

export type FilterField = 'type' | 'tag' | 'content' | 'date' | 'role';

export type FilterOp =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'not_contains'
  | 'before'
  | 'after'
  | 'between';

export interface FilterCondition {
  id: string;
  field: FilterField;
  op: FilterOp;
  value: string;
  value2?: string;
}

export type FilterConditionNode = { type: 'condition'; id: string; condition: FilterCondition };

export type FilterGroupNode = {
  type: 'group';
  id: string;
  logic: 'AND' | 'OR';
  negate: boolean;
  children: FilterNode[];
};

export type FilterNode = FilterConditionNode | FilterGroupNode;

export function newFilterId(): string {
  return `f_${Math.random().toString(36).slice(2, 11)}`;
}

export function createEmptyRoot(): FilterGroupNode {
  return { type: 'group', id: 'root', logic: 'AND', negate: false, children: [] };
}

export function createDefaultCondition(): FilterCondition {
  return {
    id: newFilterId(),
    field: 'content',
    op: 'contains',
    value: '',
  };
}

export function createEmptyGroup(): FilterGroupNode {
  return { type: 'group', id: newFilterId(), logic: 'AND', negate: false, children: [] };
}

/** Count condition rows in the tree (for toolbar badge). */
export function countConditions(root: FilterGroupNode): number {
  let n = 0;
  const walk = (node: FilterNode) => {
    if (node.type === 'condition') {
      n++;
    } else {
      for (const ch of node.children) walk(ch);
    }
  };
  for (const ch of root.children) walk(ch);
  return n;
}

function dayStartMs(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00`).getTime();
}

function dayEndMs(isoDate: string): number {
  return new Date(`${isoDate}T23:59:59.999`).getTime();
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: field/op matrix for stream filter
export function matchesCondition(c: FilterCondition, e: StreamEntry): boolean {
  if (c.field === 'date') {
    if (c.op === 'between' && (!c.value || !c.value2)) return false;
    if (c.op !== 'between' && !c.value) return false;
  } else if (c.field !== 'role' && c.field !== 'type' && !String(c.value).trim()) {
    return false;
  }
  const ts = e.timestamp.getTime();
  switch (c.field) {
    case 'type': {
      const v = c.value as StreamEntryType;
      if (c.op === 'is') return e.entryType === v;
      if (c.op === 'is_not') return e.entryType !== v;
      return false;
    }
    case 'tag': {
      const needle = c.value.toLowerCase();
      const tagsLower = e.tags.map((t) => t.toLowerCase());
      if (c.op === 'is') return tagsLower.includes(needle);
      if (c.op === 'is_not') return !tagsLower.includes(needle);
      if (c.op === 'contains') return e.tags.some((t) => t.toLowerCase().includes(needle));
      if (c.op === 'not_contains') return !e.tags.some((t) => t.toLowerCase().includes(needle));
      return false;
    }
    case 'content': {
      const text = e.content.toLowerCase();
      const needle = c.value.toLowerCase();
      if (c.op === 'contains') return text.includes(needle);
      if (c.op === 'not_contains') return !text.includes(needle);
      return false;
    }
    case 'date': {
      if (c.op === 'before') return ts < dayStartMs(c.value);
      if (c.op === 'after') return ts > dayEndMs(c.value);
      if (c.op === 'between' && c.value2)
        return ts >= dayStartMs(c.value) && ts <= dayEndMs(c.value2);
      return false;
    }
    case 'role': {
      const rid = e.roleId ?? '';
      if (c.op === 'is') {
        if (c.value === '__none__') return rid === '';
        return rid === c.value;
      }
      if (c.op === 'is_not') {
        if (c.value === '__none__') return rid !== '';
        return rid !== c.value;
      }
      return false;
    }
    default:
      return true;
  }
}

export function matchesNode(node: FilterNode, e: StreamEntry): boolean {
  if (node.type === 'condition') {
    return matchesCondition(node.condition, e);
  }
  if (node.children.length === 0) return true;
  const parts = node.children.map((ch) => matchesNode(ch, e));
  let out = node.logic === 'AND' ? parts.every(Boolean) : parts.some(Boolean);
  if (node.negate) out = !out;
  return out;
}

/** Apply advanced filter; empty tree matches all. */
export function applyAdvancedFilter(entries: StreamEntry[], root: FilterGroupNode): StreamEntry[] {
  if (countConditions(root) === 0) return entries;
  return entries.filter((e) => matchesNode(root, e));
}

interface StreamFilterState {
  root: FilterGroupNode;
  setRoot: (root: FilterGroupNode) => void;
  reset: () => void;
}

export const useStreamFilterStore = create<StreamFilterState>((set) => ({
  root: createEmptyRoot(),
  setRoot: (root) => set({ root }),
  reset: () => set({ root: createEmptyRoot() }),
}));
