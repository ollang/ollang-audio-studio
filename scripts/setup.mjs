import { copyFile, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { loadEnvFile } from 'node:process';

try {
  await copyFile(
    new URL('../.env.example', import.meta.url),
    new URL('../.env', import.meta.url),
    constants.COPYFILE_EXCL,
  );
  await chmod(new URL('../.env', import.meta.url), 0o600);
  console.log(
    'Created .env. No API key is needed for recording, editing, samples, or language detection.',
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Your existing .env was preserved.');
}
loadEnvFile(new URL('../.env', import.meta.url));
console.log('Start: docker compose up --build -d');
console.log(`Open: http://localhost:${process.env.APP_PORT || '4310'}`);
console.log(
  'Get a key: https://developers.ollang.com (free developer account; translation uses credits).',
);
console.log(
  'To translate new audio, place OLLANG_API_KEY in .env locally. See docs/ollang.md. Never paste it into chat.',
);
console.log(
  'With a key enabled, new saves translate automatically after language detection/confirmation. Saved automatic requests may resume when you add a key.',
);
