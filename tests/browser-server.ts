// Deterministic browser tests use a local detector double. Real Whisper is tested separately.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { fakeProvider } from './provider-fixture.ts';
import { DatabaseSync } from 'node:sqlite';

const dataDir = await mkdtemp(join(tmpdir(), 'audio-browser-'));
const provider = await fakeProvider();
provider.state.ready = true;
const app = await createApp({
  dataDir,
  detectorUrl: provider.origin,
  apiKey: 'browser-fixture-key',
  providerUrl: provider.origin,
  localTestAssetOrigin: provider.origin,
  pollInterval: 100,
});
app.get('/__test/provider', async () => ({
  uploads: provider.state.uploads,
  creates: provider.state.creates,
  sources: [...provider.state.uploadLanguages],
}));
app.post<{
  Body: {
    ready?: boolean;
    detectorUnavailable?: boolean;
    source?: string;
    confirmationRequired?: boolean;
    detectionDelay?: number;
    lostCreate?: boolean;
    noDubCaptions?: boolean;
    dubDuration?: number;
    missingCaptions?: boolean;
  };
}>('/__test/provider', async (request) => {
  if (typeof request.body.detectorUnavailable === 'boolean')
    provider.state.detectorUnavailable = request.body.detectorUnavailable;
  if (['en', 'pt', 'zh', 'de', 'fr'].includes(request.body.source ?? ''))
    provider.state.source = request.body.source!;
  if (typeof request.body.confirmationRequired === 'boolean')
    provider.state.confirmationRequired = request.body.confirmationRequired;
  if (typeof request.body.detectionDelay === 'number')
    provider.state.detectionDelay = Math.max(0, Math.min(3000, request.body.detectionDelay));
  if (typeof request.body.ready === 'boolean') provider.state.ready = request.body.ready;
  if (typeof request.body.lostCreate === 'boolean')
    provider.state.lostCreate = request.body.lostCreate;
  if (typeof request.body.noDubCaptions === 'boolean')
    provider.state.noDubCaptions = request.body.noDubCaptions;
  if (typeof request.body.missingCaptions === 'boolean')
    provider.state.missingCaptions = request.body.missingCaptions;
  if ([3, 4.5].includes(request.body.dubDuration ?? 0))
    provider.state.dubDuration = request.body.dubDuration!;
  return { ok: true };
});
// A completed continuation must not alter the bundled story for later tests or
// the second browser project. This route exists only on this temporary server.
app.delete<{ Params: { id: string } }>('/__test/clips/:id', async (request, reply) => {
  const db = new DatabaseSync(join(dataDir, 'demo.sqlite'));
  try {
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    const jobs = db
      .prepare('SELECT state FROM translation_jobs WHERE clip_id=?')
      .all(request.params.id);
    if (jobs.some((job) => job.state !== 'ready')) {
      db.exec('ROLLBACK');
      return reply.code(409).send({ error: 'still_processing' });
    }
    db.prepare('DELETE FROM translation_jobs WHERE clip_id=?').run(request.params.id);
    db.prepare('DELETE FROM provider_sources WHERE clip_id=?').run(request.params.id);
    db.prepare('DELETE FROM clips WHERE id=?').run(request.params.id);
    db.exec('COMMIT');
    return { ok: true };
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
  }
});
await app.listen({ host: '127.0.0.1', port: 4315 });
async function close() {
  await app.close();
  await provider.close();
  await rm(dataDir, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', () => {
  void close();
});
process.on('SIGINT', () => {
  void close();
});
