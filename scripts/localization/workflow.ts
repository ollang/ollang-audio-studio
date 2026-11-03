import { Provider, ProviderError } from '../../server/provider.ts';
import {
  installTranslations,
  pendingEntries,
  type Target,
  type Entry,
  type Catalog,
  readCatalog,
  hash,
} from './catalog.ts';
import { LocalizationStore, type Batch } from './store.ts';

export type Report = (event: string, details: Record<string, string | number | boolean>) => void;
export async function preflight(provider: Provider, signal: AbortSignal) {
  const wallet = (await provider.request('integration/credits', signal)) as {
    remainingCredits?: number;
  };
  if (typeof wallet.remainingCredits !== 'number' || wallet.remainingCredits <= 0)
    throw new Error('Available Ollang credits could not be verified.');
}
async function createOrder(
  store: LocalizationStore,
  provider: Provider,
  batch: Batch,
  signal: AbortSignal,
  report: Report,
) {
  if (!store.transition(batch.id, 'uploaded', 'submitting')) return;
  report('submitting', { language: batch.language, keys: batch.entries.length });
  try {
    const order = await provider.createDocument(batch.projectId, batch.language, signal);
    store.transition(batch.id, 'submitting', 'submitted', '', order);
    report('submitted', { language: batch.language, keys: batch.entries.length });
  } catch (error) {
    store.transition(batch.id, 'submitting', 'submission_unknown');
    throw error;
  }
}
export async function submit(
  root: string,
  store: LocalizationStore,
  provider: Provider,
  languages: Target[],
  signal: AbortSignal,
  report: Report,
) {
  await preflight(provider, signal);
  // Resume only a known successful upload. Never repeat an ambiguous POST.
  for (const batch of store
    .batches()
    .filter((b) => b.state === 'uploaded' && languages.includes(b.language))) {
    if (batch.scope !== provider.scope)
      throw new Error('Restore the original API key for this batch.');
    await createOrder(store, provider, batch, signal, report);
  }
  for (const language of languages) {
    const entries = await pendingEntries(root, language);
    const batch = store.reserve(language, entries, provider.scope);
    if (!batch) {
      const collected = new Set(
        store
          .batches()
          .filter((b) => b.language === language && b.state === 'collected')
          .flatMap((b) => b.entries.map((entry) => `${entry.key}:${entry.hash}`)),
      );
      const recoverable = entries.filter((entry) =>
        collected.has(`${entry.key}:${entry.hash}`),
      ).length;
      if (recoverable)
        report('restore_available', { language, keys: recoverable, next: 'collect' });
      report('no_new_submission', { language });
      continue;
    }
    report('uploading', { language, keys: batch.entries.length });
    try {
      const project = await provider.uploadStrings(
        Object.fromEntries(batch.entries.map((e) => [e.key, e.source])),
        `audio-studio-ui-${batch.id.slice(0, 12)}`,
        signal,
      );
      store.transition(batch.id, 'uploading', 'uploaded', project);
      await createOrder(store, provider, { ...batch, projectId: project }, signal, report);
    } catch (error) {
      store.transition(batch.id, 'uploading', 'upload_unknown');
      throw error;
    }
  }
}
export async function collect(
  root: string,
  store: LocalizationStore,
  provider: Provider,
  languages: Target[],
  signal: AbortSignal,
  report: Report,
) {
  for (const language of languages) {
    const pending = new Map((await pendingEntries(root, language)).map((e) => [e.key, e.hash]));
    const source = await readCatalog(root, 'en');
    const ready: { batch: Batch; entries: Entry[]; output: Catalog }[] = [];
    for (const batch of store.batches().filter((b) => b.language === language)) {
      // Old receipts may contain retired/changed keys. Restore only exact current
      // hashes; current submitted batches retain the stricter all-source check.
      const entries =
        batch.state === 'collected'
          ? batch.entries.filter((entry) => pending.get(entry.key) === entry.hash)
          : batch.entries;
      if (batch.state === 'collected' && !entries.length) continue;
      for (const entry of entries)
        if (hash(source[entry.key] ?? '') !== entry.hash)
          throw new Error(`English changed: ${entry.key}`);
      if (batch.scope !== provider.scope)
        throw new Error('Restore the original API key for this batch.');
      if (['submission_unknown', 'submitting'].includes(batch.state) && batch.projectId) {
        const orders = (await provider.projectOrders(batch.projectId, signal)).filter(
          (o) =>
            o.type === 'document' && o.sourceLanguage === 'en' && o.targetLanguage === language,
        );
        if (orders.length === 1) {
          store.transition(batch.id, batch.state, 'submitted', '', orders[0]!.id);
          batch.orderId = orders[0]!.id;
          batch.state = 'submitted';
        }
      }
      if (!['submitted', 'collected'].includes(batch.state)) {
        report('needs_review', { language, state: batch.state });
        continue;
      }
      if (batch.state === 'collected') report('restoring', { language, keys: entries.length });
      const order = await provider.order(batch.orderId, signal);
      if (
        order.projectId !== batch.projectId ||
        order.type !== 'document' ||
        order.sourceLanguage !== 'en' ||
        order.targetLanguage !== language
      )
        throw new ProviderError('provider_contract');
      report('provider_status', { language, status: order.status });
      if (['failed', 'cancelled', 'canceled', 'rejected'].includes(order.status))
        throw new Error(`Ollang stopped the ${language} order. No replacement was submitted.`);
      if (!['completed', 'delivered'].includes(order.status)) continue;
      ready.push({
        batch,
        entries,
        output: await provider.exportStrings(batch.orderId, language, signal),
      });
    }
    if (!ready.length) continue;
    // A deleted catalog may span several original/delta orders. Reassemble one
    // complete language before writing; never fill missing translations with English.
    const restored = new Map<string, { entry: Entry; text: string }>();
    for (const { entries, output } of ready)
      for (const entry of entries)
        restored.set(entry.key, { entry, text: output[entry.key] ?? output[entry.source] ?? '' });
    await store.install(
      ready.map(({ batch }) => batch.id),
      () =>
        installTranslations(
          root,
          language,
          [...restored.values()].map(({ entry }) => entry),
          Object.fromEntries([...restored].map(([key, { text }]) => [key, text])),
        ),
    );
    for (const { entries } of ready) report('collected', { language, keys: entries.length });
  }
}
