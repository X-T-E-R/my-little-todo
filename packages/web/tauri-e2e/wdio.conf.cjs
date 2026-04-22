const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const tauriDriverPath = path.join(
  cargoBin,
  process.platform === 'win32' ? 'tauri-driver.exe' : 'tauri-driver',
);
const nativeDriverPath = path.join(
  repoRoot,
  '.cache',
  'tauri-webdriver',
  process.platform === 'win32' ? 'msedgedriver.exe' : 'msedgedriver',
);
const defaultApplicationPath = path.join(
  repoRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'my-little-todo.exe' : 'my-little-todo',
);
const applicationPath = process.env.MLT_TAURI_E2E_APPLICATION
  ? path.resolve(process.env.MLT_TAURI_E2E_APPLICATION)
  : defaultApplicationPath;
const tauriE2eDataDir = path.join(
  repoRoot,
  '.cache',
  'tauri-e2e',
  'appdata',
  `run-${Date.now()}-${process.pid}`,
);
const tauriE2eSeedDir = process.env.MLT_TAURI_E2E_SEED_DIR
  ? path.resolve(process.env.MLT_TAURI_E2E_SEED_DIR)
  : null;

let tauriDriverProcess;

exports.config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: 4444,
  path: '/',
  specs: ['./specs/**/*.e2e.cjs'],
  maxInstances: 1,
  logLevel: 'info',
  outputDir: './tauri-e2e/logs',
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': {
        application: applicationPath,
        args: [
          '--mlt-e2e-skip-onboarding',
          '--mlt-app-data-dir',
          tauriE2eDataDir,
        ],
      },
    },
  ],
  reporters: ['spec'],
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120_000,
  },
  onPrepare() {
    fs.rmSync(tauriE2eDataDir, { recursive: true, force: true });
    fs.mkdirSync(tauriE2eDataDir, { recursive: true });
    if (tauriE2eSeedDir) {
      fs.cpSync(tauriE2eSeedDir, tauriE2eDataDir, {
        force: true,
        recursive: true,
      });
    }
    if (process.env.MLT_TAURI_E2E_APPLICATION) {
      return;
    }
    const result = spawnSync(
      pnpmCommand,
      ['--filter', '@my-little-todo/web', 'exec', 'tauri', 'build', '--debug', '--no-bundle'],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: false,
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `pnpm --filter @my-little-todo/web exec tauri build --debug --no-bundle failed with exit code ${result.status ?? 1}`,
      );
    }
  },
  async beforeSession() {
    tauriDriverProcess = spawn(tauriDriverPath, ['--native-driver', nativeDriverPath], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  },
  afterSession() {
    tauriDriverProcess?.kill();
  },
};
