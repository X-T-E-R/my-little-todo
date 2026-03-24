import type { Role } from '@my-little-todo/core';
import { create } from 'zustand';
import i18n from '../locales';
import { generateRoleId, loadRolesData, saveRoles } from '../storage/roleRepo';

interface RoleSettings {
  maxRoles: number;
  showCounts: boolean;
  showLandingCard: boolean;
}

interface RoleState {
  roles: Role[];
  currentRoleId: string | null;
  loading: boolean;
  settings: RoleSettings;
  /** Tracks role that was just switched to, for landing card display. */
  landingRoleId: string | null;

  load: () => Promise<void>;
  switchRole: (roleId: string | null) => void;
  dismissLanding: () => void;
  createRole: (name: string, opts?: { color?: string; icon?: string }) => Promise<Role>;
  updateRole: (id: string, changes: Partial<Role>) => Promise<void>;
  deleteRole: (id: string) => Promise<void>;
  reorderRoles: (orderedIds: string[]) => Promise<void>;
  updateSettings: (changes: Partial<RoleSettings>) => Promise<void>;
}

export const useRoleStore = create<RoleState>((set, get) => ({
  roles: [],
  currentRoleId: null,
  loading: false,
  settings: { maxRoles: 8, showCounts: false, showLandingCard: true },
  landingRoleId: null,

  load: async () => {
    set({ loading: true });
    try {
      const { roles, settings, currentRoleId } = await loadRolesData();
      set({ roles, settings, currentRoleId, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  switchRole: (roleId) => {
    const { currentRoleId, roles, settings } = get();
    if (roleId === currentRoleId) return;

    if (roleId) {
      const role = roles.find((r) => r.id === roleId);
      if (role) {
        role.lastActiveAt = new Date();
      }
    }

    set({
      currentRoleId: roleId,
      landingRoleId: roleId && settings.showLandingCard ? roleId : null,
    });

    saveRoles(roles, settings, roleId).catch(() => {});
  },

  dismissLanding: () => set({ landingRoleId: null }),

  createRole: async (name, opts) => {
    const { roles, settings, currentRoleId } = get();
    if (roles.length >= settings.maxRoles) {
      throw new Error(
        i18n.t('roles.Role limit reached ({{max}})', { ns: 'common', max: settings.maxRoles }),
      );
    }
    const role: Role = {
      id: generateRoleId(),
      name,
      color: opts?.color,
      icon: opts?.icon,
      order: roles.length,
      createdAt: new Date(),
    };
    const updated = [...roles, role];
    await saveRoles(updated, settings, currentRoleId);
    set({ roles: updated });
    return role;
  },

  updateRole: async (id, changes) => {
    const { roles, settings, currentRoleId } = get();
    const updated = roles.map((r) => (r.id === id ? { ...r, ...changes } : r));
    await saveRoles(updated, settings, currentRoleId);
    set({ roles: updated });
  },

  deleteRole: async (id) => {
    const { roles, settings, currentRoleId } = get();
    const updated = roles.filter((r) => r.id !== id).map((r, i) => ({ ...r, order: i }));
    const newCurrentRoleId = currentRoleId === id ? null : currentRoleId;
    await saveRoles(updated, settings, newCurrentRoleId);
    set({ roles: updated, currentRoleId: newCurrentRoleId });
  },

  reorderRoles: async (orderedIds) => {
    const { roles, settings, currentRoleId } = get();
    const reordered = orderedIds
      .map((id, i) => {
        const role = roles.find((r) => r.id === id);
        return role ? { ...role, order: i } : null;
      })
      .filter((r): r is Role => r !== null);
    await saveRoles(reordered, settings, currentRoleId);
    set({ roles: reordered });
  },

  updateSettings: async (changes) => {
    const { roles, settings, currentRoleId } = get();
    const updated = { ...settings, ...changes };
    await saveRoles(roles, updated, currentRoleId);
    set({ settings: updated });
  },
}));

export const NO_ROLE_FILTER = '__none__';

export function filterByRole<T extends { roleId?: string }>(
  items: T[],
  roleId: string | null,
): T[] {
  if (!roleId) return items;
  if (roleId === NO_ROLE_FILTER) return items.filter((item) => !item.roleId);
  return items.filter((item) => item.roleId === roleId);
}
