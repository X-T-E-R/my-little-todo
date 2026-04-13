import type { PluginDefinition, PluginManifest } from '@my-little-todo/plugin-sdk';
import {
  createPluginContext,
  loadLocalesForPlugin,
  removeLocalesForPlugin,
  runPluginActivate,
  runPluginDeactivate,
} from './pluginApi';
import { readPluginFile } from './pluginFs';
import { clearPluginUi } from './pluginUiRegistry';
import type { PluginModuleExports } from './types';

const active = new Map<
  string,
  { definition: PluginDefinition; disposers: (() => void)[]; styleEl?: HTMLStyleElement }
>();

async function tryLoadLocales(pluginId: string): Promise<void> {
  const bundles: Record<string, Record<string, string>> = {};
  for (const lng of ['en', 'zh-CN']) {
    const raw = await readPluginFile(pluginId, `locales/${lng}.json`);
    if (!raw) continue;
    try {
      const text = new TextDecoder().decode(raw);
      bundles[lng] = JSON.parse(text) as Record<string, string>;
    } catch {
      /* skip */
    }
  }
  if (Object.keys(bundles).length > 0) {
    await loadLocalesForPlugin(pluginId, bundles);
  }
}

function injectStylesheet(
  pluginId: string,
  manifest: PluginManifest,
): HTMLStyleElement | undefined {
  if (!manifest.styleSheet) return undefined;
  const el = document.createElement('style');
  el.setAttribute('data-plugin-id', pluginId);
  el.setAttribute('data-plugin-style', manifest.styleSheet);
  document.head.appendChild(el);
  void readPluginFile(pluginId, manifest.styleSheet).then((buf) => {
    if (buf) {
      el.textContent = new TextDecoder().decode(buf);
    }
  });
  return el;
}

export async function activatePlugin(pluginId: string, manifest: PluginManifest): Promise<void> {
  if (active.has(pluginId)) return;

  const disposers: (() => void)[] = [];
  const onDispose = (fn: () => void) => {
    disposers.push(fn);
  };

  const code = await readPluginFile(pluginId, manifest.entryPoint);
  if (!code) {
    throw new Error(`Plugin entry not found: ${manifest.entryPoint}`);
  }

  const blob = new Blob([new Uint8Array(code)], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  let mod: PluginModuleExports;
  try {
    mod = (await import(/* @vite-ignore */ url)) as PluginModuleExports;
  } finally {
    URL.revokeObjectURL(url);
  }

  const definition = mod.default ?? mod.plugin;
  if (!definition || typeof definition.activate !== 'function') {
    throw new Error('Plugin must export default definePlugin({ activate })');
  }

  await tryLoadLocales(pluginId);

  const styleEl = injectStylesheet(pluginId, manifest);

  const ctx = createPluginContext(pluginId, manifest, onDispose);
  await runPluginActivate(definition, ctx);

  active.set(pluginId, { definition, disposers, styleEl });
}

export async function deactivatePlugin(pluginId: string): Promise<void> {
  const entry = active.get(pluginId);
  if (!entry) return;

  await runPluginDeactivate(entry.definition);

  for (const d of [...entry.disposers].reverse()) {
    try {
      d();
    } catch {
      /* ignore */
    }
  }

  if (entry.styleEl?.parentNode) {
    entry.styleEl.parentNode.removeChild(entry.styleEl);
  }

  clearPluginUi(pluginId);
  await removeLocalesForPlugin(pluginId, ['en', 'zh-CN']);
  active.delete(pluginId);
}

export function isPluginActive(pluginId: string): boolean {
  return active.has(pluginId);
}
