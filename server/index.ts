import { createApp } from './app.ts';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { configuration } from './config.ts';

try {
  loadEnvFile(new URL('../.env', import.meta.url));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const config = configuration(process.env, fileURLToPath(new URL('..', import.meta.url)));
const app = await createApp(config.app);
try {
  await app.listen({ port: config.port, host: config.host });
  console.log(
    `Ollang Audio Studio ready on port ${config.port} — translations run only after an explicit request.`,
  );
} catch (error) {
  console.error(
    (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      ? 'Port is in use. Change APP_PORT in .env (Docker), or PORT for native development.'
      : 'Could not start. Check configuration and data directory permissions.',
  );
  await app.close();
  process.exitCode = 1;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close();
  });
