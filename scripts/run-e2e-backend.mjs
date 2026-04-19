import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'mlt-e2e-'));
const env = {
  ...process.env,
  AUTH_PROVIDER: 'none',
  HOST: '127.0.0.1',
  PORT: process.env.PORT || '3401',
  DATA_DIR: dataDir,
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:4173,http://localhost:4173',
};

let shuttingDown = false;

const child = spawn('cargo', ['run', '-p', 'mlt-server-bin'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

function cleanup() {
  rmSync(dataDir, { recursive: true, force: true });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  if (!child.killed) {
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 5_000).unref();
  }

  cleanup();
  process.exit(exitCode);
}

child.on('exit', (code, signal) => {
  cleanup();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[e2e-backend] failed to start backend', error);
  shutdown(1);
});

for (const event of ['SIGINT', 'SIGTERM']) {
  process.on(event, () => shutdown(0));
}
