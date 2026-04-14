import type { PluginManifest, PluginPermission } from '@my-little-todo/plugin-sdk';
import { z } from 'zod';

const permissionSchema = z.enum([
  'data:read',
  'data:write',
  'tasks:read',
  'stream:read',
  'server:run',
  'mcp:expose',
  'http:expose',
  'ui:settings',
  'ui:command',
  'ui:widget',
  'ui:panel',
]);

const serverMcpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  permission: z.enum(['read', 'create', 'full']),
});

const serverHttpRouteSchema = z.object({
  path: z.string().min(1).regex(/^\//, 'server.httpRoutes.path must start with /'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
});

const serverManifestSchema = z.object({
  entryPoint: z.string().min(1),
  capabilities: z.array(z.enum(['mcp', 'http'])).min(1),
  mcpTools: z.array(serverMcpToolSchema).optional(),
  httpRoutes: z.array(serverHttpRouteSchema).optional(),
});

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
  server: serverManifestSchema.optional(),
})
  .superRefine((manifest, ctx) => {
    if (!manifest.server) return;

    if (!manifest.permissions.includes('server:run')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissions'],
        message: "server manifests require 'server:run' permission",
      });
    }
    if (manifest.server.capabilities.includes('mcp') && !manifest.permissions.includes('mcp:expose')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissions'],
        message: "server MCP capability requires 'mcp:expose' permission",
      });
    }
    if (manifest.server.capabilities.includes('http') && !manifest.permissions.includes('http:expose')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissions'],
        message: "server HTTP capability requires 'http:expose' permission",
      });
    }
    if (manifest.server.capabilities.includes('mcp') && (!manifest.server.mcpTools || manifest.server.mcpTools.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['server', 'mcpTools'],
        message: 'server MCP capability requires at least one mcpTools entry',
      });
    }
    if (manifest.server.capabilities.includes('http') && (!manifest.server.httpRoutes || manifest.server.httpRoutes.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['server', 'httpRoutes'],
        message: 'server HTTP capability requires at least one httpRoutes entry',
      });
    }
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
