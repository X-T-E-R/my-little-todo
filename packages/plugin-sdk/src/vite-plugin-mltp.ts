import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import type { Plugin as VitePlugin } from 'vite';

interface PackagedManifest {
  entryPoint?: string;
  server?: {
    entryPoint?: string;
  };
  styleSheet?: string;
}

export interface MltpPluginOptions {
  /** Path to manifest.json (default: project root manifest.json) */
  manifestPath?: string;
  /** Output .mltp filename (default: `${id}-${version}.mltp` from manifest) */
  outFile?: string;
}

function readManifestJson(
  root: string,
  manifestPath: string,
): Promise<{ raw: string; id: string; version: string }> {
  const full = path.resolve(root, manifestPath);
  return readFile(full, 'utf-8').then((raw) => {
    const parsed = JSON.parse(raw) as { id?: string; version?: string };
    if (!parsed.id || !parsed.version) {
      throw new Error(`[vite-plugin-mltp] manifest must include id and version: ${full}`);
    }
    return { raw, id: parsed.id, version: parsed.version };
  });
}

async function collectOptionalFiles(
  root: string,
  manifestPath: string,
): Promise<Array<{ name: string; data: Buffer }>> {
  const manifestDir = path.dirname(path.resolve(root, manifestPath));
  const manifestFull = path.resolve(root, manifestPath);
  const raw = await readFile(manifestFull, 'utf-8');
  const manifest = JSON.parse(raw) as PackagedManifest;
  const out: Array<{ name: string; data: Buffer }> = [];
  if (manifest.styleSheet) {
    const p = path.join(manifestDir, manifest.styleSheet);
    const data = await readFile(p);
    out.push({ name: manifest.styleSheet.replace(/\\/g, '/'), data });
  }
  const localesDir = path.join(manifestDir, 'locales');
  try {
    const names = await readdir(localesDir);
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      const data = await readFile(path.join(localesDir, n));
      out.push({ name: `locales/${n}`, data });
    }
  } catch {
    // optional
  }
  const readmePath = path.join(manifestDir, 'README.md');
  try {
    const data = await readFile(readmePath);
    out.push({ name: 'README.md', data });
  } catch {
    // optional
  }
  const iconNames = ['icon.png', 'icon.svg'];
  for (const icon of iconNames) {
    try {
      const data = await readFile(path.join(manifestDir, icon));
      out.push({ name: icon, data });
      break;
    } catch {
      // optional
    }
  }
  return out;
}

function resolveBundleEntryTargets(
  manifestRaw: string,
  bundle: Record<string, { type: 'chunk' | 'asset'; fileName: string; isEntry?: boolean }>,
): Array<{ bundleFileName: string; packageFileName: string }> {
  const manifest = JSON.parse(manifestRaw) as PackagedManifest;
  const packageEntries = [manifest.entryPoint ?? 'index.js', manifest.server?.entryPoint]
    .filter((value): value is string => !!value)
    .map((value) => value.replace(/\\/g, '/'));
  const entryChunks = Object.values(bundle).filter(
    (item): item is { type: 'chunk'; fileName: string; isEntry: true } =>
      item.type === 'chunk' && item.isEntry === true && item.fileName.endsWith('.js'),
  );

  return packageEntries.map((packageFileName, index) => {
    const exactMatch = entryChunks.find((chunk) => chunk.fileName === packageFileName);
    if (exactMatch) {
      return {
        bundleFileName: exactMatch.fileName,
        packageFileName,
      };
    }
    if (index === 0 && entryChunks.length === 1) {
      const fallbackChunk = entryChunks[0];
      if (!fallbackChunk) {
        throw new Error('[vite-plugin-mltp] Could not resolve the fallback entry chunk');
      }
      return {
        bundleFileName: fallbackChunk.fileName,
        packageFileName,
      };
    }
    const availableEntries = entryChunks.map((chunk) => chunk.fileName).join(', ') || '<none>';
    throw new Error(
      `[vite-plugin-mltp] Could not find bundle entry for ${packageFileName}. Available entry chunks: ${availableEntries}`,
    );
  });
}

/**
 * Vite plugin: after build, packages dist output into a .mltp (zip) next to dist/.
 */
export function mltpPlugin(options: MltpPluginOptions = {}): VitePlugin {
  const manifestPath = options.manifestPath ?? 'manifest.json';
  let root = process.cwd();

  return {
    name: 'vite-plugin-mltp',
    configResolved(config) {
      root = config.root;
    },
    async writeBundle(outputOptions, bundle) {
      const outDir = outputOptions.dir ?? path.join(root, 'dist');
      const { raw: manifestRaw, id, version } = await readManifestJson(root, manifestPath);
      const zip = new JSZip();
      zip.file('manifest.json', manifestRaw);

      const bundleEntries = resolveBundleEntryTargets(
        manifestRaw,
        bundle as Record<string, { type: 'chunk' | 'asset'; fileName: string; isEntry?: boolean }>,
      );
      if (bundleEntries.length === 0) {
        throw new Error('[vite-plugin-mltp] Could not find any JS entry chunk in bundle');
      }
      for (const entry of bundleEntries) {
        const entryPath = path.join(outDir, entry.bundleFileName);
        const entryBuf = await readFile(entryPath);
        zip.file(entry.packageFileName, entryBuf);
      }

      const extras = await collectOptionalFiles(root, manifestPath);
      for (const f of extras) {
        zip.file(f.name, f.data);
      }

      const blob = await zip.generateAsync({ type: 'nodebuffer' });
      const outName = options.outFile ?? `${id}-${version}.mltp`;
      const { writeFile } = await import('node:fs/promises');
      const outPath = path.join(outDir, outName);
      await writeFile(outPath, blob);
      console.info(`[vite-plugin-mltp] wrote ${outPath}`);
    },
  };
}
