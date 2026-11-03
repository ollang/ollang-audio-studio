import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/storage.ts';

test('blank migration, uncertain detection, correction and restart preserve data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-store-'));
  try {
    let store = new Store(dir);
    store.add('one', "It's a title'); DROP TABLE clips;--", 'hash', 3);
    store.detected('one', {
      language: 'pt',
      confidence: 0.4,
      duration: 3,
      confirmationRequired: true,
      reason: 'low_confidence',
    });
    assert.equal(store.get('one')?.sourceLanguage, '');
    assert.equal(store.get('one')?.status, 'needs_language');
    store.confirm('one', 'zh');
    store.add('two', 'Interrupted', 'two', 2);
    store.close();
    store = new Store(dir);
    assert.equal(store.get('one')?.sourceLanguage, 'zh');
    assert.equal(store.get('two')?.notice, 'interrupted');
    assert.equal(store.get('two')?.confirmationRequired, true);
    assert.equal(store.list().length, 2);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('version one migration preserves existing recordings and appends ordered clips', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readFileSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'audio-series-migration-'));
  try {
    const old = new DatabaseSync(join(dir, 'demo.sqlite'));
    old.exec(readFileSync('migrations/001_initial.sql', 'utf8'));
    old
      .prepare(
        "INSERT INTO clips(id,title,sha256,duration,status,created_at) VALUES('original','Preserved','hash',3,'ready','2026-10-14')",
      )
      .run();
    old.close();
    let store = new Store(dir);
    assert.equal(store.get('original')?.seriesId, 'original');
    assert.equal(store.get('original')?.position, 1);
    store.add('second', 'Second', 'hash2', 4, 'original');
    store.add('third', 'Third', 'hash3', 4, 'original');
    store.add('separate', 'New series', 'hash4', 2);
    assert.equal(store.get('second')?.position, 2);
    assert.equal(store.get('third')?.position, 3);
    assert.equal(store.get('separate')?.position, 1);
    store.close();
    store = new Store(dir);
    assert.equal(store.get('third')?.seriesId, 'original');
    assert.equal(store.get('third')?.position, 3);
    assert.equal(store.hash('original'), 'hash');
    assert.equal(store.list().length, 4);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
