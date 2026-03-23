import type { Role } from '@my-little-todo/core';
import { getSetting, putSetting } from './settingsApi';

const SETTING_KEY = 'roles';

interface RolesData {
  roles: SerializedRole[];
  settings: {
    maxRoles: number;
    showCounts: boolean;
    showLandingCard: boolean;
  };
  currentRoleId?: string | null;
}

interface SerializedRole {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  order: number;
  createdAt: string;
  lastActiveAt?: string;
  lastActivitySummary?: string;
}

function serializeRole(role: Role): SerializedRole {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    icon: role.icon,
    order: role.order,
    createdAt: role.createdAt.toISOString(),
    lastActiveAt: role.lastActiveAt?.toISOString(),
    lastActivitySummary: role.lastActivitySummary,
  };
}

function deserializeRole(raw: SerializedRole): Role {
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color,
    icon: raw.icon,
    order: raw.order,
    createdAt: new Date(raw.createdAt),
    lastActiveAt: raw.lastActiveAt ? new Date(raw.lastActiveAt) : undefined,
    lastActivitySummary: raw.lastActivitySummary,
  };
}

const DEFAULT_DATA: RolesData = {
  roles: [],
  settings: { maxRoles: 8, showCounts: false, showLandingCard: true },
};

export async function loadRolesData(): Promise<{
  roles: Role[];
  settings: RolesData['settings'];
  currentRoleId: string | null;
}> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return { roles: [], settings: { ...DEFAULT_DATA.settings }, currentRoleId: null };
  try {
    const data: RolesData = JSON.parse(raw);
    return {
      roles: (data.roles ?? []).map(deserializeRole),
      settings: { ...DEFAULT_DATA.settings, ...data.settings },
      currentRoleId: data.currentRoleId ?? null,
    };
  } catch {
    return { roles: [], settings: { ...DEFAULT_DATA.settings }, currentRoleId: null };
  }
}

export async function saveRoles(
  roles: Role[],
  settings: RolesData['settings'],
  currentRoleId?: string | null,
): Promise<void> {
  const data: RolesData = {
    roles: roles.map(serializeRole),
    settings,
    currentRoleId: currentRoleId ?? null,
  };
  await putSetting(SETTING_KEY, JSON.stringify(data));
}

let roleCounter = 0;

export function generateRoleId(): string {
  roleCounter += 1;
  const ts = Date.now().toString(36);
  return `role-${ts}-${roleCounter}`;
}
