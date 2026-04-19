import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const isWindows = process.platform === 'win32';
const tauriDriverName = isWindows ? 'tauri-driver.exe' : 'tauri-driver';
const edgeDriverToolName = isWindows ? 'msedgedriver-tool.exe' : 'msedgedriver-tool';
const edgeDriverName = isWindows ? 'msedgedriver.exe' : 'msedgedriver';
const cacheDir = path.join(repoRoot, '.cache', 'tauri-webdriver');
const nativeDriverPath = path.join(cacheDir, edgeDriverName);

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}`);
  }
}

function ensureCargoBinary(name, installArgs) {
  const binaryPath = path.join(cargoBin, name);
  if (existsSync(binaryPath)) {
    return binaryPath;
  }
  run('cargo', installArgs);
  if (!existsSync(binaryPath)) {
    throw new Error(`Expected ${name} at ${binaryPath} after install.`);
  }
  return binaryPath;
}

mkdirSync(cacheDir, { recursive: true });

const tauriDriverPath = ensureCargoBinary(tauriDriverName, ['install', 'tauri-driver', '--locked']);
const edgeDriverToolPath = ensureCargoBinary(edgeDriverToolName, [
  'install',
  '--git',
  'https://github.com/chippers/msedgedriver-tool',
]);

if (!existsSync(nativeDriverPath)) {
  run(edgeDriverToolPath, [], cacheDir);
}

if (!existsSync(nativeDriverPath)) {
  throw new Error(`Expected native driver at ${nativeDriverPath}.`);
}

console.log(JSON.stringify({ tauriDriverPath, nativeDriverPath }));
