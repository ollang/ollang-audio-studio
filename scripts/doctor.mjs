import { loadEnvFile } from 'node:process';

try {
  loadEnvFile(new URL('../.env', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const port = process.env.PORT || process.env.APP_PORT || '4310';
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/config`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const config = await response.json();
  console.log(`App: reachable on port ${port}`);
  console.log(`Language detector: ${config.detector}`);
  console.log(
    `Ollang key: ${config.apiKeyConfigured ? 'present' : 'not configured (not needed yet)'}`,
  );
  console.log(
    `Live translations: ${config.liveTranslationEnabled ? 'configured; new saves translate automatically and saved automatic requests may resume' : 'not configured; bundled playback and local editing available'}`,
  );
  if (config.detector !== 'ready') process.exitCode = 1;
} catch (error) {
  console.error(
    `App unavailable: ${error.message}. Run docker compose ps and check the local port.`,
  );
  process.exitCode = 1;
}
