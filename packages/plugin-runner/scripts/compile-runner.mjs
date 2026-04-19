import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const denoVersion = '2.7.12';

async function main() {
  const { output, target } = parseArgs(process.argv.slice(2));
  if (!output) {
    throw new Error('Missing --output <path> for plugin runner compile.');
  }

  await run(defaultPnpmCommand(), ['run', 'build'], { cwd: packageRoot });
  const denoBin = await resolveDenoBinary(target);
  await mkdir(path.dirname(output), { recursive: true });
  await rm(output, { force: true }).catch(() => {});

  const args = [
    'compile',
    '--allow-env',
    '--allow-read',
    '--allow-net=127.0.0.1',
    '--output',
    output,
    'dist/main.js',
  ];
  await run(denoBin, args, { cwd: packageRoot });
}

function parseArgs(args) {
  const parsed = { output: '', target: '' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--output') {
      parsed.output = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--target') {
      parsed.target = args[index + 1] ?? '';
      index += 1;
    }
  }
  return parsed;
}

async function resolveDenoBinary(target) {
  const explicit = process.env.MLT_DENO_BIN;
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const relativeExecutable = process.platform === 'win32' ? 'deno.exe' : 'deno';
  const cacheDir = path.join(workspaceRoot, '.cache', 'tools', 'deno', denoVersion);
  const cached = path.join(cacheDir, relativeExecutable);
  if (existsSync(cached)) {
    return cached;
  }

  const assetName = denoAssetName(target || defaultTarget());
  const archivePath = path.join(cacheDir, assetName);
  await mkdir(cacheDir, { recursive: true });
  await download(
    `https://github.com/denoland/deno/releases/download/v${denoVersion}/${assetName}`,
    archivePath,
  );
  await extractArchive(archivePath, cacheDir);
  if (!existsSync(cached)) {
    throw new Error(`Deno binary was not extracted to ${cached}.`);
  }
  return cached;
}

function defaultTarget() {
  if (process.platform === 'win32') return 'x86_64-pc-windows-msvc';
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }
  return process.arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
}

function denoAssetName(target) {
  const supported = new Map([
    ['x86_64-pc-windows-msvc', 'deno-x86_64-pc-windows-msvc.zip'],
    ['aarch64-pc-windows-msvc', 'deno-aarch64-pc-windows-msvc.zip'],
    ['x86_64-unknown-linux-gnu', 'deno-x86_64-unknown-linux-gnu.zip'],
    ['aarch64-unknown-linux-gnu', 'deno-aarch64-unknown-linux-gnu.zip'],
    ['x86_64-apple-darwin', 'deno-x86_64-apple-darwin.zip'],
    ['aarch64-apple-darwin', 'deno-aarch64-apple-darwin.zip'],
  ]);
  const asset = supported.get(target);
  if (!asset) {
    throw new Error(`Unsupported Deno target for plugin runner compile: ${target}`);
  }
  return asset;
}

async function download(url, destination) {
  await new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'my-little-todo-plugin-runner-build',
        },
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          download(response.headers.location, destination).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
          return;
        }
        pipeline(response, createWriteStream(destination)).then(resolve, reject);
      },
    );
    request.on('error', reject);
  });
}

async function extractArchive(archivePath, destination) {
  if (process.platform === 'win32') {
    await run('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
    ]);
    return;
  }
  await run('unzip', ['-o', archivePath, '-d', destination]);
}

function defaultPnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const windowsCmd = process.platform === 'win32' && /\.cmd$/i.test(command);
    const child = windowsCmd
      ? spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], {
          stdio: 'inherit',
          ...options,
        })
      : spawn(command, args, {
          stdio: 'inherit',
          ...options,
        });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

main().catch((error) => {
  console.error('[plugin-runner compile]', error);
  process.exitCode = 1;
});
