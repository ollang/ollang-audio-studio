import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export const targets = ['pt', 'zh'] as const;
export type Target = (typeof targets)[number];
export type Catalog = Record<string, string>;
export type Entry = { key: string; source: string; hash: string };
// Validate emptiness without trimming: hashes must describe the exact source.
const CatalogSchema = z.record(
  z.string().min(1),
  z.string().refine((text) => Boolean(text.trim())),
);
const ManifestSchema = z.object({
  version: z.literal(1),
  generator: z.literal('ollang'),
  languages: z.record(z.string(), z.record(z.string(), z.string())),
});
export type Manifest = z.infer<typeof ManifestSchema>;
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export function placeholders(text: string) {
  const tokens = text.match(/\{\{\s*\w+\s*\}\}/g) ?? [];
  if (/[{}]/.test(text.replace(/\{\{\s*\w+\s*\}\}/g, '')))
    throw new Error('Invalid placeholder syntax; use {{name}}.');
  return tokens
    .map((token) => token.replace(/\s/g, ''))
    .sort()
    .join('\0');
}
export async function readCatalog(root: string, language: string): Promise<Catalog> {
  const catalog = CatalogSchema.parse(
    JSON.parse(await readFile(join(root, 'locales', `${language}.json`), 'utf8')),
  );
  for (const text of Object.values(catalog)) placeholders(text);
  return catalog;
}
export async function readManifest(root: string): Promise<Manifest> {
  try {
    return ManifestSchema.parse(
      JSON.parse(await readFile(join(root, 'locales', 'manifest.json'), 'utf8')),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { version: 1, generator: 'ollang', languages: {} };
    throw new Error('Invalid localization manifest.', { cause: error });
  }
}
export function validateCatalog(source: Catalog, translated: Catalog) {
  if (Object.keys(source).sort().join('\0') !== Object.keys(translated).sort().join('\0'))
    throw new Error('Translation keys must exactly match the English catalog.');
  for (const [key, text] of Object.entries(source)) {
    if (!translated[key]?.trim() || placeholders(text) !== placeholders(translated[key]!))
      throw new Error(`Missing translation or changed placeholders: ${key}`);
  }
}
export async function writeJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function pendingEntries(root: string, language: Target) {
  const source = await readCatalog(root, 'en');
  const manifest = await readManifest(root);
  let translated: Catalog = {};
  try {
    translated = await readCatalog(root, language);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return Object.entries(source)
    .filter(
      ([key, text]) =>
        manifest.languages[language]?.[key] !== hash(text) ||
        !translated[key]?.trim() ||
        placeholders(text) !== placeholders(translated[key]!),
    )
    .map(([key, source]) => ({ key, source, hash: hash(source) }));
}
/** Validate the complete batch before changing either checked-in file. */
export async function installTranslations(
  root: string,
  language: Target,
  entries: Entry[],
  output: Catalog,
) {
  const source = await readCatalog(root, 'en');
  const translated = await readCatalog(root, language).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return {} as Catalog;
    throw error;
  });
  for (const entry of entries) {
    if (hash(source[entry.key] ?? '') !== entry.hash)
      throw new Error(`English changed: ${entry.key}`);
    // Ollang content export may use the English source text as its key.
    const text = output[entry.key] ?? output[entry.source];
    if (!text?.trim() || placeholders(text) !== placeholders(entry.source))
      throw new Error(`Missing translation or changed placeholders: ${entry.key}`);
    translated[entry.key] = text;
  }
  const catalog = Object.fromEntries(Object.keys(source).map((key) => [key, translated[key]!]));
  validateCatalog(source, catalog);
  const manifest = await readManifest(root);
  manifest.languages[language] ??= {};
  for (const entry of entries) manifest.languages[language]![entry.key] = entry.hash;
  // Catalog first: an interruption before the manifest leaves a detectable stale
  // catalog. Re-collection is safe and uses the existing order.
  await writeJson(join(root, 'locales', `${language}.json`), catalog);
  await writeJson(join(root, 'locales', 'manifest.json'), manifest);
}
