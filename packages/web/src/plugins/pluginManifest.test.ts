import { describe, expect, it } from 'vitest';
import { parsePluginManifestJson } from './pluginManifest';

describe('parsePluginManifestJson', () => {
  it('accepts server capability manifests with MCP and HTTP metadata', () => {
    const manifest = parsePluginManifestJson(
      JSON.stringify({
        id: 'demo-server',
        name: 'Demo Server',
        version: '0.1.0',
        minAppVersion: '0.1.0',
        permissions: ['ui:settings', 'server:run', 'mcp:expose', 'http:expose'],
        entryPoint: 'index.js',
        server: {
          entryPoint: 'server.js',
          capabilities: ['mcp', 'http'],
          mcpTools: [
            {
              name: 'plugin.demo-server.echo',
              description: 'Echo request data',
              permission: 'read',
            },
          ],
          httpRoutes: [{ path: '/echo', method: 'GET' }],
        },
      }),
    );

    expect(manifest.server?.entryPoint).toBe('server.js');
    expect(manifest.server?.mcpTools?.[0]?.name).toBe('plugin.demo-server.echo');
    expect(manifest.server?.httpRoutes?.[0]?.path).toBe('/echo');
  });

  it('rejects server manifests when required permissions are missing', () => {
    expect(() =>
      parsePluginManifestJson(
        JSON.stringify({
          id: 'demo-server',
          name: 'Demo Server',
          version: '0.1.0',
          minAppVersion: '0.1.0',
          permissions: ['ui:settings'],
          entryPoint: 'index.js',
          server: {
            entryPoint: 'server.js',
            capabilities: ['mcp'],
            mcpTools: [
              {
                name: 'plugin.demo-server.echo',
                description: 'Echo request data',
                permission: 'read',
              },
            ],
          },
        }),
      ),
    ).toThrow(/mcp:expose/i);
  });
});
