import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { validateWav } from './wav.ts';

/**
 * Publish a complete WAV before its SQLite row. The caller owns the submission
 * lock and must check committed rows first. A valid orphan belongs to its exact
 * bytes; an invalid orphan from an interrupted older save can be replaced.
 */
export async function saveOriginal(file: string, bytes: Buffer): Promise<boolean> {
  let prior: Buffer | undefined;
  try {
    prior = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (prior) {
    const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
    if (hash(prior) === hash(bytes)) return true;
    try {
      validateWav(prior);
      return false;
    } catch {
      // No row references these invalid bytes. Replace them with the validated save.
    }
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
}
