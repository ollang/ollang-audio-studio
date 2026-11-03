import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Clip, DetectionResult } from '../shared/contracts.ts';

type Row = {
  id: string;
  title: string;
  series_id: string;
  position: number;
  sha256: string;
  duration: number;
  source_language: string;
  detected_language: string;
  confidence: number | null;
  confirmation_required: number;
  status: Clip['status'];
  notice: string;
  created_at: string;
  automatic_translation: number;
};
function clip(row: Row): Clip {
  return {
    id: row.id,
    title: row.title,
    seriesId: row.series_id,
    position: row.position,
    duration: row.duration,
    sourceLanguage: row.source_language,
    detectedLanguage: row.detected_language,
    confidence: row.confidence,
    confirmationRequired: Boolean(row.confirmation_required),
    status: row.status,
    notice: row.notice,
    createdAt: row.created_at,
    audioUrl: `/api/clips/${row.id}/audio`,
    automaticTranslation: Boolean(row.automatic_translation),
  };
}

/** Single-process SQLite owner; ordered clips and provider receipts share one DB. */
export class Store {
  readonly db: DatabaseSync;
  readonly media: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.media = join(directory, 'media');
    mkdirSync(this.media, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'demo.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    const migrations = [
      '001_initial.sql',
      '002_series.sql',
      '003_translations.sql',
      '004_automatic_translation.sql',
    ];
    if (version.user_version > migrations.length) {
      this.db.close();
      throw new Error('Database belongs to a newer application version.');
    }
    // Each SQL file advances user_version in the same transaction as its schema.
    // Keep the list explicit so a fresh install and an upgrade take the same path.
    for (const migration of migrations.slice(version.user_version)) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        this.db.close();
        throw error;
      }
    }
    // No external work is retried implicitly after a stopped process.
    this.db
      .prepare(
        "UPDATE clips SET status='needs_language', confirmation_required=1, notice='interrupted' WHERE status='analyzing'",
      )
      .run();
  }
  list(): Clip[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM clips ORDER BY (SELECT created_at FROM clips AS first WHERE first.series_id=clips.series_id ORDER BY position LIMIT 1),series_id,position',
        )
        .all() as Row[]
    ).map(clip);
  }
  get(id: string): Clip | undefined {
    const row = this.db.prepare('SELECT * FROM clips WHERE id=?').get(id) as Row | undefined;
    return row ? clip(row) : undefined;
  }
  hash(id: string): string | undefined {
    return (
      this.db.prepare('SELECT sha256 FROM clips WHERE id=?').get(id) as
        { sha256: string } | undefined
    )?.sha256;
  }
  hasSeries(id: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM clips WHERE series_id=? LIMIT 1').get(id));
  }
  add(
    id: string,
    title: string,
    hash: string,
    duration: number,
    seriesId = id,
    automatic = false,
  ): Clip {
    this.db
      .prepare(
        "INSERT INTO clips(id,title,sha256,duration,status,created_at,series_id,automatic_translation,position) VALUES(?,?,?,?,'analyzing',?,?,?,(SELECT COALESCE(MAX(position),0)+1 FROM clips WHERE series_id=?))",
      )
      .run(
        id,
        title,
        hash,
        duration,
        new Date().toISOString(),
        seriesId,
        Number(automatic),
        seriesId,
      );
    return this.get(id)!;
  }
  detecting(id: string) {
    this.db.prepare("UPDATE clips SET status='analyzing',notice='' WHERE id=?").run(id);
  }
  detected(id: string, result: DetectionResult) {
    this.db
      .prepare(
        'UPDATE clips SET detected_language=?,source_language=?,confidence=?,confirmation_required=?,status=?,notice=? WHERE id=?',
      )
      .run(
        result.language,
        result.confirmationRequired ? '' : result.language,
        result.confidence,
        Number(result.confirmationRequired),
        result.confirmationRequired ? 'needs_language' : 'ready',
        result.reason,
        id,
      );
  }
  failed(id: string) {
    this.db
      .prepare(
        "UPDATE clips SET status='needs_language',confirmation_required=1,notice='detector_unavailable' WHERE id=?",
      )
      .run(id);
  }
  confirm(id: string, language: string) {
    this.db
      .prepare(
        "UPDATE clips SET source_language=?,confirmation_required=0,status='ready',notice='confirmed' WHERE id=? AND status != 'analyzing'",
      )
      .run(language, id);
    return this.get(id);
  }
  close() {
    this.db.close();
  }
}
