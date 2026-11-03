import { loadEnvFile } from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Provider, ProviderError } from '../server/provider.ts';
import {
  readCatalog,
  validateCatalog,
  pendingEntries,
  targets,
  type Target,
} from './localization/catalog.ts';
import { LocalizationStore } from './localization/store.ts';
import { submit, collect } from './localization/workflow.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  loadEnvFile(join(root, '.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const [action = 'plan', ...options] = process.argv.slice(2);
const languages: Target[] = [];
for (let i = 0; i < options.length; i += 2) {
  const language = options[i + 1];
  if (options[i] !== '--language' || !targets.includes(language as Target))
    throw new Error('Use --language pt or --language zh; repeat to select both.');
  if (!languages.includes(language as Target)) languages.push(language as Target);
}
if (!languages.length) languages.push(...targets);
const report = (event: string, details: Record<string, string | number | boolean>) =>
  console.log(JSON.stringify({ event, ...details }));
let store: LocalizationStore | undefined;
try {
  if (!['plan', 'check', 'status', 'submit', 'collect'].includes(action))
    throw new Error(
      'Usage: npm run localize -- [plan|check|status|submit|collect] [--language pt|zh]',
    );
  if (action === 'check' || action === 'plan') {
    const source = await readCatalog(root, 'en');
    for (const language of languages) {
      const entries = await pendingEntries(root, language);
      if (action === 'check') validateCatalog(source, await readCatalog(root, language));
      report('catalog', { language, total: Object.keys(source).length, pending: entries.length });
      if (action === 'check' && entries.length) process.exitCode = 1;
      if (action === 'plan') console.log(JSON.stringify({ language, entries }));
    }
  } else {
    store = new LocalizationStore(resolve(root, process.env.DATA_DIR ?? '.data'));
    if (action === 'status') {
      for (const batch of store.batches().filter((b) => languages.includes(b.language)))
        report('batch', {
          language: batch.language,
          keys: batch.entries.length,
          state: batch.state,
        });
    } else {
      const key = process.env.OLLANG_API_KEY;
      if (!key) throw new Error('Save OLLANG_API_KEY in the ignored .env file first.');
      const provider = new Provider(key);
      const run = action === 'submit' ? submit : collect;
      await run(root, store, provider, languages, AbortSignal.timeout(300000), report);
    }
  }
} catch (error) {
  console.error(
    error instanceof ProviderError
      ? error.code
      : error instanceof Error
        ? error.message
        : 'Localization failed.',
  );
  process.exitCode = 1;
} finally {
  store?.close();
}
