import type { PluginManifest } from '@my-little-todo/plugin-sdk';
import JSZip from 'jszip';
import { writePluginFile } from './pluginFs';
import { parsePluginManifestJson } from './pluginManifest';

/**
 * Parse .mltp (zip) buffer, validate manifest, write all files to plugin sandbox.
 */
export async function installMltpPackage(
  data: ArrayBuffer,
  _options?: { source?: 'file' | 'marketplace'; sourceUrl?: string },
): Promise<{ manifest: PluginManifest }> {
  const zip = await JSZip.loadAsync(data);
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new Error('Invalid .mltp: missing manifest.json');
  }
  const manifestRaw = await manifestEntry.async('string');
  const manifest = parsePluginManifestJson(manifestRaw);
  const entryName = manifest.entryPoint.replace(/\\/g, '/');

  let hasEntry = false;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const norm = path.replace(/\\/g, '/');
    if (norm === 'manifest.json') continue;
    const file = zip.file(norm);
    if (!file) continue;
    const buf = await file.async('uint8array');
    await writePluginFile(manifest.id, norm, buf);
    if (norm === entryName) hasEntry = true;
  }

  if (!hasEntry) {
    throw new Error(`Invalid .mltp: missing entry file ${entryName}`);
  }

  return { manifest };
}
