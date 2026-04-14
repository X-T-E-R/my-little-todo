import { startRunnerHttpServer } from './httpServer.js';
import { PluginRunnerSkeleton } from './runner.js';
import type { RunnerLaunchConfig } from './types.js';

function readConfigFromEnv(): RunnerLaunchConfig {
  const pluginId = process.env.MLT_PLUGIN_ID || '';
  const pluginRoot = process.env.MLT_PLUGIN_ROOT || '';
  const entryPoint = process.env.MLT_PLUGIN_ENTRY || '';
  const port = Number(process.env.MLT_PLUGIN_PORT || 0);
  const token = process.env.MLT_PLUGIN_TOKEN || '';

  if (!pluginId || !pluginRoot || !entryPoint || !port || !token) {
    throw new Error(
      'Missing runner bootstrap env. Expected MLT_PLUGIN_ID / ROOT / ENTRY / PORT / TOKEN.',
    );
  }

  return { pluginId, pluginRoot, entryPoint, port, token };
}

async function main(): Promise<void> {
  const config = readConfigFromEnv();
  const runner = new PluginRunnerSkeleton(config);
  await runner.start();
  const httpServer = await startRunnerHttpServer(config, runner);
  const tools = await runner.listTools();
  wireShutdown(runner, httpServer.close);

  console.log(
    JSON.stringify({
      ready: true,
      pluginId: config.pluginId,
      port: config.port,
      baseUrl: httpServer.baseUrl,
      entryPoint: config.entryPoint,
      tools,
    }),
  );
}

function wireShutdown(
  runner: PluginRunnerSkeleton,
  closeServer: () => Promise<void>,
): void {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await closeServer();
    } finally {
      await runner.stop();
    }
  };

  process.once('SIGINT', () => {
    void stop().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void stop().finally(() => process.exit(0));
  });
}

void main().catch((error) => {
  console.error('[plugin-runner]', error);
  process.exitCode = 1;
});
