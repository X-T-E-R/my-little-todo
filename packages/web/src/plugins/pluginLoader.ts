import type { PluginManifest } from '@my-little-todo/plugin-sdk';
import JSZip from 'jszip';
import { writePluginFile } from './pluginFs';
import { parsePluginManifestJson } from './pluginManifest';

/**
 * Parse .mltp (zip) buffer, validate manifest, write all files to plugin sandbox.
 */
export async function inspectMltpPackage(data: ArrayBuffer): Promise<{ manifest: PluginManifest; zip: JSZip }> {
  const zip = await JSZip.loadAsync(data);
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new Error('Invalid .mltp: missing manifest.json');
  }
  const manifestRaw = await manifestEntry.async('string');
  const manifest = parsePluginManifestJson(manifestRaw);
  return { manifest, zip };
}

export async function installMltpPackage(
  data: ArrayBuffer,
  _options?: { source?: 'file' | 'marketplace'; sourceUrl?: string },
): Promise<{ manifest: PluginManifest }> {
  const { manifest, zip } = await inspectMltpPackage(data);
  const entryName = manifest.entryPoint.replace(/\\/g, '/');
  const serverEntryName = manifest.server?.entryPoint.replace(/\\/g, '/');

  let hasEntry = false;
  let hasServerEntry = !serverEntryName;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const norm = path.replace(/\\/g, '/');
    if (norm === 'manifest.json') continue;
    const file = zip.file(norm);
    if (!file) continue;
    const buf = await file.async('uint8array');
    await writePluginFile(manifest.id, norm, buf);
    if (norm === entryName) hasEntry = true;
    if (serverEntryName && norm === serverEntryName) hasServerEntry = true;
  }

  if (!hasEntry) {
    throw new Error(`Invalid .mltp: missing entry file ${entryName}`);
  }
  if (!hasServerEntry && serverEntryName) {
    throw new Error(`Invalid .mltp: missing server entry file ${serverEntryName}`);
  }

  return { manifest };
}
