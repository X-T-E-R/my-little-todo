import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate runner test port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for runner readiness.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          const payload = JSON.parse(line);
          if (payload.ready) {
            clearTimeout(timeout);
            resolve(payload);
            return;
          }
        } catch {
          // ignore non-json logs
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Runner exited before ready (code=${code}, signal=${signal}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await once(child, 'exit');
}

test('runner serves health, MCP, and HTTP routes with token auth', async () => {
  const port = await allocatePort();
  const token = 'runner-test-token';
  const pluginRoot = path.resolve('test/fixtures');
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      MLT_PLUGIN_ID: 'fixture-plugin',
      MLT_PLUGIN_ROOT: pluginRoot,
      MLT_PLUGIN_ENTRY: 'server-plugin.mjs',
      MLT_PLUGIN_PORT: String(port),
      MLT_PLUGIN_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const ready = await waitForReady(child);
    assert.equal(ready.pluginId, 'fixture-plugin');
    assert.equal(ready.baseUrl, `http://127.0.0.1:${port}`);

    const authHeaders = {
      'x-mlt-plugin-token': token,
    };

    const unauthorized = await fetch(`${ready.baseUrl}/health`);
    assert.equal(unauthorized.status, 401);

    const health = await fetch(`${ready.baseUrl}/health`, { headers: authHeaders });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      pluginId: 'fixture-plugin',
      status: 'running',
    });

    const toolList = await fetch(`${ready.baseUrl}/mcp/tools/list`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(toolList.status, 200);
    assert.deepEqual(await toolList.json(), {
      tools: [{ name: 'echo' }],
    });

    const toolCall = await fetch(`${ready.baseUrl}/mcp/tools/call`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'echo',
        arguments: { hello: 'world' },
      }),
    });
    assert.equal(toolCall.status, 200);
    assert.deepEqual(await toolCall.json(), {
      content: {
        ok: true,
        pluginId: 'fixture-plugin',
        echoed: { hello: 'world' },
      },
    });

    const routeResponse = await fetch(`${ready.baseUrl}/echo?value=1`, {
      headers: authHeaders,
    });
    assert.equal(routeResponse.status, 200);
    assert.deepEqual(await routeResponse.json(), {
      ok: true,
      pluginId: 'fixture-plugin',
      query: { value: '1' },
    });
  } finally {
    await stopChild(child);
  }
});
