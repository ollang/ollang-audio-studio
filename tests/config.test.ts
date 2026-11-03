import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuration } from '../server/config.ts';

test('native configuration is project-relative and supports a key-only install', () => {
  const config = configuration({ PORT: '4350', OLLANG_API_KEY: 'test-key' }, '/tmp/studio');
  assert.equal(config.port, 4350);
  assert.equal(config.app.dataDir, '/tmp/studio/.data');
  assert.equal(config.app.staticDir, '/tmp/studio/dist');
  assert.equal(config.app.apiKey, 'test-key');
  assert.equal(configuration({ DATA_DIR: '/data' }, '/app').app.dataDir, '/data');
});
test('invalid configuration reports names without echoing credentials or private values', () => {
  for (const env of [
    { PORT: 'secret-invalid-port' },
    { DETECTOR_URL: 'https://name:secret@example.com' },
  ]) {
    assert.throws(
      () => configuration(env, '/tmp/studio'),
      (error) =>
        error instanceof Error &&
        !error.message.includes('secret') &&
        error.message.includes('Invalid configuration'),
    );
  }
});
