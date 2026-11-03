import { loadEnvFile } from 'node:process';
import { Provider, ProviderError } from '../server/provider.ts';
import { checkProviderAccess } from '../server/provider-access.ts';
try {
  // Compose passes environment values without copying .env into the image.
  try {
    loadEnvFile(new URL('../.env', import.meta.url));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!process.env.OLLANG_API_KEY) {
    console.error(
      'Configure OLLANG_API_KEY in the local .env first. Get a key at https://developers.ollang.com.',
    );
    process.exitCode = 1;
  } else {
    const provider = new Provider(process.env.OLLANG_API_KEY);
    const signal = AbortSignal.timeout(30000);
    const result = await checkProviderAccess(provider, signal);
    console.log(JSON.stringify(result));
    if (result.creditsAvailable === false) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof ProviderError ? error.code : 'Preflight could not be verified.');
  process.exitCode = 1;
}
