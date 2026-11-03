import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { hash, type Entry, type Target } from './catalog.ts';

export type Batch = {
  id: string;
  language: Target;
  entries: Entry[];
  scope: string;
  state: string;
  projectId: string;
  orderId: string;
};
// Avoid blocking our own filesystem promises with a second synchronous SQLite
// lock. SQLite still serializes collectors in different operating-system processes.
const installations = new Map<string, Promise<void>>();

export class LocalizationStore {
  readonly databasePath: string;
  readonly db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.databasePath = join(realpathSync(directory), 'ui-localization.sqlite');
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY, language TEXT NOT NULL, entries TEXT NOT NULL,
        scope TEXT NOT NULL, state TEXT NOT NULL, projectId TEXT NOT NULL DEFAULT '',
        orderId TEXT NOT NULL DEFAULT ''
      );`);
  }
  batches(): Batch[] {
    return (
      this.db.prepare('SELECT * FROM batches ORDER BY rowid').all() as unknown as (Omit<
        Batch,
        'entries'
      > & { entries: string })[]
    ).map((row) => ({ ...row, entries: JSON.parse(row.entries) as Entry[] }));
  }
  reserve(language: Target, entries: Entry[], scope: string): Batch | undefined {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const blocked = new Set(
        this.batches()
          .filter((b) => b.language === language)
          .flatMap((b) => b.entries.map((e) => `${e.key}:${e.hash}`)),
      );
      const fresh = entries.filter((e) => !blocked.has(`${e.key}:${e.hash}`));
      if (!fresh.length) {
        this.db.exec('COMMIT');
        return;
      }
      const id = hash(JSON.stringify([language, fresh]));
      const inserted = this.db
        .prepare(
          `INSERT OR IGNORE INTO batches(id,language,entries,scope,state) VALUES(?,?,?,?,'uploading')`,
        )
        .run(id, language, JSON.stringify(fresh), scope).changes;
      this.db.exec('COMMIT');
      if (inserted)
        return {
          id,
          language,
          entries: fresh,
          scope,
          state: 'uploading',
          projectId: '',
          orderId: '',
        };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  transition(id: string, from: string, to: string, project = '', order = '') {
    return (
      this.db
        .prepare(
          `UPDATE batches SET state=?,
      projectId=CASE WHEN ?='' THEN projectId ELSE ? END,
      orderId=CASE WHEN ?='' THEN orderId ELSE ? END WHERE id=? AND state=?`,
        )
        .run(to, project, project, order, order, id, from).changes > 0
    );
  }
  /** Serialize catalog/manifest updates by collectors sharing this ledger. */
  async install(ids: string[], write: () => Promise<void>) {
    const previous = installations.get(this.databasePath) ?? Promise.resolve();
    const installation = previous
      .catch(() => {})
      .then(async () => {
        this.db.exec('BEGIN IMMEDIATE');
        try {
          // Collected receipts can repair lost catalogs using their existing orders.
          await write();
          for (const id of ids) this.transition(id, 'submitted', 'collected');
          this.db.exec('COMMIT');
        } catch (error) {
          this.db.exec('ROLLBACK');
          throw error;
        }
      });
    installations.set(this.databasePath, installation);
    try {
      await installation;
    } finally {
      if (installations.get(this.databasePath) === installation)
        installations.delete(this.databasePath);
    }
  }

  close() {
    this.db.close();
  }
}
