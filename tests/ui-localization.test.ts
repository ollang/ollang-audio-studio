import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Provider } from '../server/provider.ts';
import { LocalizationStore } from '../scripts/localization/store.ts';
import {
  hash,
  pendingEntries,
  readCatalog,
  readManifest,
  type Catalog,
} from '../scripts/localization/catalog.ts';
import { collect, submit } from '../scripts/localization/workflow.ts';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'studio-ui-'));
  await mkdir(join(root, 'locales'));
  const source = { save: 'Save', count: '{{count}} clips', duplicate: 'Save' };
  for (const language of ['en', 'pt', 'zh'])
    await writeFile(join(root, 'locales', `${language}.json`), JSON.stringify(source));
  const state = {
    credits: 100,
    uploads: 0,
    creates: 0,
    exports: 0,
    ready: false,
    lostCreate: false,
    lostUpload: false,
    badPlaceholder: false,
    wrongIdentity: false,
    sourceKeys: false,
    uploadFields: [] as string[],
    orders: [] as string[],
    languages: new Map<string, string>(),
    strings: {} as Catalog,
    outputs: new Map<string, Catalog>(),
  };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const url = new URL(req.url!, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    const send = (data: unknown) => res.end(JSON.stringify({ data }));
    if (url.pathname === '/integration/credits') return send({ remainingCredits: state.credits });
    if (url.pathname === '/integration/upload/direct') {
      state.uploads++;
      const data = await new Request('http://fixture', {
        method: 'POST',
        body: new Uint8Array(body),
        headers: { 'content-type': req.headers['content-type']! },
      }).formData();
      state.uploadFields = [...data.keys()].sort();
      const file = data.get('file') as File;
      assert.ok(file.name.endsWith('.json'));
      state.strings = JSON.parse(await file.text()) as Catalog;
      if (state.lostUpload) return req.socket.destroy();
      return send({ projectId: 'ui-project' });
    }
    if (url.pathname === '/integration/orders/create') {
      state.creates++;
      const data = JSON.parse(body.toString());
      assert.equal(data.orderType, 'document');
      const language = data.targetLanguageConfigs[0].language as string;
      const orderId = `ui-${language}-${state.creates}`;
      state.orders.push(orderId);
      state.languages.set(orderId, language);
      state.outputs.set(orderId, { ...state.strings });
      if (state.lostCreate) return req.socket.destroy();
      return send([{ orderId }]);
    }
    const order = (id: string) => ({
      id,
      projectId: state.wrongIdentity ? 'wrong' : 'ui-project',
      type: 'document',
      sourceLanguage: 'en',
      targetLanguage: state.languages.get(id),
      status: state.ready ? 'completed' : 'ongoing',
    });
    if (url.pathname === '/integration/project/ui-project')
      return send({ id: 'ui-project', name: 'UI fixture' });
    if (url.pathname === '/integration/orders') return send(state.orders.map(order));
    if (url.pathname.startsWith('/integration/orders/'))
      return send(order(url.pathname.slice('/integration/orders/'.length)));
    if (url.pathname === '/integration/content/export') {
      state.exports++;
      return send(
        Object.fromEntries(
          Object.entries(state.outputs.get(url.searchParams.get('orderIds[]')!) ?? {}).map(
            ([key, text]) => [
              state.sourceKeys ? text : key,
              state.badPlaceholder ? 'Invalid' : `Translated ${text}`,
            ],
          ),
        ),
      );
    }
    res.statusCode = 404;
    send({});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const provider = new Provider(
    'test-ui-key',
    `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  );
  const store = new LocalizationStore(join(root, '.data'));
  const signal = AbortSignal.timeout(15000);
  const report = () => {};
  return {
    root,
    source,
    state,
    store,
    provider,
    submit: () => submit(root, store, provider, ['pt'], signal, report),
    collect: () => collect(root, store, provider, ['pt'], signal, report),
    close: async () => {
      store.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('UI workflow previews exact deltas, collects validated catalogs and never repeats orders', async () => {
  const f = await setup();
  try {
    assert.equal((await pendingEntries(f.root, 'pt')).length, 3);
    await f.submit();
    await f.submit();
    assert.equal(f.state.uploads, 1);
    assert.equal(f.state.creates, 1);
    assert.deepEqual(f.state.uploadFields, ['file', 'name', 'sourceLanguage']);
    await f.collect();
    assert.equal(f.state.exports, 0);
    f.state.ready = true;
    f.state.sourceKeys = true;
    await f.collect();
    assert.equal((await readCatalog(f.root, 'pt')).count, 'Translated {{count}} clips');
    assert.equal((await readManifest(f.root)).languages.pt!.save, hash('Save'));
    assert.equal((await pendingEntries(f.root, 'pt')).length, 0);
    await f.submit();
    await f.collect();
    assert.equal(f.state.uploads, 1);
    assert.equal(f.state.creates, 1);
    assert.equal(f.state.exports, 1);
    await writeFile(
      join(f.root, 'locales', 'en.json'),
      JSON.stringify({ ...f.source, save: 'Save clip' }),
    );
    assert.deepEqual(
      (await pendingEntries(f.root, 'pt')).map((e) => e.key),
      ['save'],
    );
  } finally {
    await f.close();
  }
});
test('UI credit preflight refuses paid writes when no balance is available', async () => {
  const f = await setup();
  try {
    f.state.credits = 0;
    await assert.rejects(f.submit, /credits/);
    assert.equal(f.state.uploads, 0);
    assert.equal(f.state.creates, 0);
    assert.equal(f.store.batches().length, 0);
  } finally {
    await f.close();
  }
});
test('lost document-order response reconciles by project after reopening SQLite without resubmission', async () => {
  const f = await setup();
  try {
    f.state.lostCreate = true;
    await assert.rejects(f.submit);
    assert.equal(f.store.batches()[0]!.state, 'submission_unknown');
    const reopened = new LocalizationStore(join(f.root, '.data'));
    f.state.lostCreate = false;
    f.state.ready = true;
    try {
      await collect(f.root, reopened, f.provider, ['pt'], AbortSignal.timeout(5000), () => {});
      assert.equal(reopened.batches()[0]!.state, 'collected');
    } finally {
      reopened.close();
    }
    assert.equal(f.state.uploads, 1);
    assert.equal(f.state.creates, 1);
  } finally {
    await f.close();
  }
});
test('uncertain upload remains blocked across reruns and credentials changes never resume writes', async () => {
  const f = await setup();
  try {
    f.state.lostUpload = true;
    await assert.rejects(f.submit);
    await f.submit();
    assert.equal(f.state.uploads, 1);
    assert.equal(f.state.creates, 0);
    assert.equal(f.store.batches()[0]!.state, 'upload_unknown');
    await assert.rejects(
      collect(
        f.root,
        f.store,
        new Provider('other', f.provider.base),
        ['pt'],
        AbortSignal.timeout(5000),
        () => {},
      ),
      /original API/,
    );
  } finally {
    await f.close();
  }
});
test('placeholder loss, stale sources and wrong order identity never overwrite catalogs', async () => {
  for (const failure of ['placeholder', 'stale', 'identity']) {
    const f = await setup();
    try {
      await f.submit();
      f.state.ready = true;
      if (failure === 'placeholder') f.state.badPlaceholder = true;
      if (failure === 'identity') f.state.wrongIdentity = true;
      if (failure === 'stale')
        await writeFile(
          join(f.root, 'locales', 'en.json'),
          JSON.stringify({ ...f.source, save: 'Changed' }),
        );
      const before = await readFile(join(f.root, 'locales', 'pt.json'), 'utf8');
      await assert.rejects(f.collect);
      assert.equal(await readFile(join(f.root, 'locales', 'pt.json'), 'utf8'), before);
      assert.equal(f.store.batches()[0]!.state, 'submitted');
    } finally {
      await f.close();
    }
  }
});

test('collecting both languages preserves both manifests and a second store cannot reserve the same work', async () => {
  const f = await setup();
  const second = new LocalizationStore(join(f.root, '.data'));
  try {
    await submit(f.root, f.store, f.provider, ['pt', 'zh'], AbortSignal.timeout(5000), () => {});
    assert.equal(
      second.reserve('pt', await pendingEntries(f.root, 'pt'), f.provider.scope),
      undefined,
    );
    f.state.ready = true;
    await collect(f.root, f.store, f.provider, ['pt', 'zh'], AbortSignal.timeout(5000), () => {});
    const manifest = await readManifest(f.root);
    assert.equal(manifest.languages.pt!.count, hash('{{count}} clips'));
    assert.equal(manifest.languages.zh!.count, hash('{{count}} clips'));
    assert.equal(f.state.uploads, 2);
    assert.equal(f.state.creates, 2);
    assert.equal((await pendingEntries(f.root, 'zh')).length, 0);
  } finally {
    second.close();
    await f.close();
  }
});

test('source hashes preserve whitespace and malformed interpolation is rejected before provider work', async () => {
  const f = await setup();
  try {
    await writeFile(
      join(f.root, 'locales', 'en.json'),
      JSON.stringify({ ...f.source, save: ' Save ' }),
    );
    const entry = (await pendingEntries(f.root, 'pt')).find((item) => item.key === 'save')!;
    assert.equal(entry.source, ' Save ');
    assert.equal(entry.hash, hash(' Save '));
    await writeFile(
      join(f.root, 'locales', 'en.json'),
      JSON.stringify({ ...f.source, count: '{count} clips' }),
    );
    await assert.rejects(f.submit, /Invalid placeholder syntax/);
    assert.equal(f.state.uploads, 0);
    assert.equal(f.state.creates, 0);
  } finally {
    await f.close();
  }
});

test('collected original and delta orders restore lost catalogs/manifests without new submissions', async () => {
  const f = await setup();
  try {
    f.state.ready = true;
    await f.submit();
    await f.collect();
    await writeFile(
      join(f.root, 'locales/en.json'),
      JSON.stringify({ ...f.source, save: 'Save clip' }),
    );
    await f.submit();
    await f.collect();
    const expected = await readCatalog(f.root, 'pt');
    await rm(join(f.root, 'locales/pt.json'));
    await rm(join(f.root, 'locales/manifest.json'));
    await f.submit();
    assert.equal(f.state.uploads, 2);
    assert.equal(f.state.creates, 2);
    await f.collect();
    assert.deepEqual(await readCatalog(f.root, 'pt'), expected);
    assert.equal((await pendingEntries(f.root, 'pt')).length, 0);
    const exports = f.state.exports;
    await f.collect();
    assert.equal(f.state.exports, exports);
    assert.equal(f.state.uploads, 2);
    assert.equal(f.state.creates, 2);
  } finally {
    await f.close();
  }
});

test('restoration preserves existing catalogs on wrong credentials, stale sources or invalid output', async () => {
  const f = await setup();
  try {
    f.state.ready = true;
    await f.submit();
    await f.collect();
    const before = await readFile(join(f.root, 'locales/pt.json'), 'utf8');
    await rm(join(f.root, 'locales/manifest.json'));
    await assert.rejects(
      collect(
        f.root,
        f.store,
        new Provider('other', f.provider.base),
        ['pt'],
        AbortSignal.timeout(5000),
        () => {},
      ),
      /original API key/,
    );
    assert.equal(await readFile(join(f.root, 'locales/pt.json'), 'utf8'), before);
    f.state.badPlaceholder = true;
    await assert.rejects(f.collect, /placeholders/);
    assert.equal(await readFile(join(f.root, 'locales/pt.json'), 'utf8'), before);
    f.state.badPlaceholder = false;
    await writeFile(
      join(f.root, 'locales/en.json'),
      JSON.stringify({ ...f.source, save: 'New source' }),
    );
    await f.collect();
    assert.equal(await readFile(join(f.root, 'locales/pt.json'), 'utf8'), before);
    assert.deepEqual(
      (await pendingEntries(f.root, 'pt')).map((entry) => entry.key),
      ['save'],
    );
    assert.equal(f.state.uploads, 1);
    assert.equal(f.state.creates, 1);
  } finally {
    await f.close();
  }
});

test('concurrent restoration through two ledger handles preserves both languages and receipts', async () => {
  const f = await setup();
  const second = new LocalizationStore(join(f.root, '.data'));
  try {
    f.state.ready = true;
    await submit(f.root, f.store, f.provider, ['pt', 'zh'], AbortSignal.timeout(5000), () => {});
    await collect(f.root, f.store, f.provider, ['pt', 'zh'], AbortSignal.timeout(5000), () => {});
    await rm(join(f.root, 'locales/manifest.json'));
    await Promise.all([
      collect(f.root, f.store, f.provider, ['pt'], AbortSignal.timeout(5000), () => {}),
      collect(f.root, second, f.provider, ['zh'], AbortSignal.timeout(5000), () => {}),
    ]);
    assert.equal((await pendingEntries(f.root, 'pt')).length, 0);
    assert.equal((await pendingEntries(f.root, 'zh')).length, 0);
    assert.ok(f.store.batches().every((batch) => batch.state === 'collected'));
    assert.equal(f.state.uploads, 2);
    assert.equal(f.state.creates, 2);
  } finally {
    second.close();
    await f.close();
  }
});
