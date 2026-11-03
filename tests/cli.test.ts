import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';

const execute = promisify(execFile);
const cli = 'examples/translate-clip.mjs';
const clip = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'CLI review recording',
  sourceLanguage: 'en',
  detectedLanguage: 'en',
  duration: 3.4,
  status: 'ready',
  confirmationRequired: false,
};

async function localApp(
  t: TestContext,
  handle: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer(handle);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return String(address.port);
}

test('CLI listing makes one read and prints only clip-selection fields', async (t) => {
  const requests: string[] = [];
  const port = await localApp(t, (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify([
        {
          ...clip,
          audioUrl: 'private-media-marker',
          translations: [{ providerId: 'private-receipt-marker' }],
        },
        {
          ...clip,
          id: 'pending',
          sourceLanguage: '',
          status: 'needs_language',
          confirmationRequired: true,
        },
      ]),
    );
  });
  const result = await execute(process.execPath, [cli, '--list-clips', '--port', port]);
  assert.deepEqual(requests, ['GET /api/clips']);
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      id: clip.id,
      title: clip.title,
      language: 'en',
      durationSeconds: 3.4,
      status: 'ready',
      confirmationRequired: false,
    },
    {
      id: 'pending',
      title: clip.title,
      language: 'en',
      durationSeconds: 3.4,
      status: 'needs_language',
      confirmationRequired: true,
    },
  ]);
  assert.doesNotMatch(result.stdout + result.stderr, /private-media-marker|private-receipt-marker/);
});

test('CLI listing supports an empty local library', async (t) => {
  const port = await localApp(t, (_request, response) => response.end('[]'));
  const result = await execute(process.execPath, [cli, '--list-clips', '--port', port]);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

test('CLI listing reads a real saved clip from the app with no provider configured', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'studio-cli-'));
  const app = await createApp({ dataDir, detectorUrl: 'http://127.0.0.1:1' });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const audio = await readFile('fixtures/short/en.wav');
  const saved = await app.inject({
    method: 'POST',
    url: '/api/clips',
    headers: {
      'content-type': 'audio/wav',
      'x-submission-id': clip.id,
      'x-clip-title': encodeURIComponent(clip.title),
    },
    payload: audio,
  });
  assert.equal(saved.statusCode, 201);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const result = await execute(process.execPath, [
    cli,
    '--list-clips',
    '--port',
    String(address.port),
  ]);
  const listed = JSON.parse(result.stdout);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, clip.id);
  assert.equal(listed[0].title, clip.title);
  assert.ok(listed[0].durationSeconds > 0 && listed[0].durationSeconds <= 5);
  assert.ok(['analyzing', 'needs_language'].includes(listed[0].status));
  const config = await app.inject({ method: 'GET', url: '/api/config' });
  assert.equal(config.json().apiKeyConfigured, false);
});

test('CLI rejects mixed read/write modes and missing consent before any request', async (t) => {
  const requests: string[] = [];
  const port = await localApp(t, (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.end('[]');
  });
  for (const args of [
    ['--list-clips', '--submit'],
    ['--list-clips', '--clip', clip.id],
    ['--list-clips', '--target', 'pt'],
    ['--clip', clip.id, '--target', 'pt'],
  ])
    await assert.rejects(execute(process.execPath, [cli, ...args, '--port', port]));
  assert.deepEqual(requests, []);
});

test('CLI reports invalid/failed app responses without echoing their bodies or posting', async (t) => {
  let payload = 'private-response-marker';
  let status = 200;
  const requests: string[] = [];
  const port = await localApp(t, (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.writeHead(status);
    response.end(payload);
  });
  for (const [body, code] of [
    ['private-response-marker', 200],
    [JSON.stringify({ key: 'private-response-marker' }), 200],
    [JSON.stringify([{ id: 'private-response-marker' }]), 200],
    ['private-response-marker', 503],
  ] as const) {
    payload = body;
    status = code;
    await assert.rejects(
      execute(process.execPath, [cli, '--list-clips', '--port', port]),
      (error: unknown) => {
        assert.ok(error instanceof Error && 'stderr' in error && 'stdout' in error);
        assert.equal(error.stdout, '');
        assert.doesNotMatch(String(error.stderr), /private-response-marker/);
        assert.match(String(error.stderr), /local app/i);
        return true;
      },
    );
  }
  assert.deepEqual(requests, Array(4).fill('GET /api/clips'));
});

test('CLI submits only the selected ready clip and deduplicated targets to the local app', async (t) => {
  const requests: string[] = [];
  let submitted = '';
  const port = await localApp(t, (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.method === 'GET') response.end(JSON.stringify([clip]));
    else {
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        submitted += chunk;
      });
      request.on('end', () => response.end(JSON.stringify([{ target: 'pt', state: 'queued' }])));
    }
  });
  const result = await execute(process.execPath, [
    cli,
    '--clip',
    clip.id,
    '--target',
    'pt',
    '--target',
    'pt',
    '--submit',
    '--port',
    port,
  ]);
  assert.deepEqual(requests, ['GET /api/clips', `POST /api/clips/${clip.id}/translations`]);
  assert.deepEqual(JSON.parse(submitted), { targets: ['pt'] });
  assert.deepEqual(JSON.parse(result.stdout), [{ target: 'pt', state: 'queued' }]);
});

test('CLI refuses unconfirmed or absent-source clips without posting', async (t) => {
  const requests: string[] = [];
  let pending = { ...clip, confirmationRequired: true };
  const port = await localApp(t, (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.end(JSON.stringify([pending]));
  });
  for (const candidate of [
    { ...clip, confirmationRequired: true },
    { ...clip, sourceLanguage: '' },
    { ...clip, status: 'analyzing' },
  ]) {
    pending = candidate;
    await assert.rejects(
      execute(process.execPath, [
        cli,
        '--clip',
        clip.id,
        '--target',
        'pt',
        '--submit',
        '--port',
        port,
      ]),
    );
  }
  assert.deepEqual(requests, Array(3).fill('GET /api/clips'));
});
