import type { PluginManifest, PluginPermission } from '@my-little-todo/plugin-sdk';
import { z } from 'zod';

const permissionSchema = z.enum([
  'data:read',
  'data:write',
  'tasks:read',
  'stream:read',
  'ui:settings',
  'ui:command',
  'ui:widget',
  'ui:panel',
]);

const manifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be kebab-case'),
  name: z.string().min(1),
  version: z.string().min(1),
  minAppVersion: z.string().min(1),
  stability: z.enum(['stable', 'beta', 'experimental']).optional(),
  author: z
    .object({
      name: z.string(),
      url: z.string().optional(),
    })
    .optional(),
  description: z.string().optional(),
  homepage: z.string().optional(),
  license: z.string().optional(),
  permissions: z.array(permissionSchema).default([]),
  entryPoint: z.string().min(1).default('index.js'),
  styleSheet: z.string().optional(),
});

export type ParsedManifest = z.infer<typeof manifestSchema>;

export function parsePluginManifestJson(raw: string): PluginManifest {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Invalid manifest.json: not valid JSON');
  }
  const parsed = manifestSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Invalid manifest.json: ${msg}`);
  }
  return parsed.data as PluginManifest;
}

export function hasPermission(manifest: PluginManifest, perm: PluginPermission): boolean {
  return manifest.permissions.includes(perm);
}

export function manifestHasSettingsPage(manifest: PluginManifest): boolean {
  return hasPermission(manifest, 'ui:settings');
}
