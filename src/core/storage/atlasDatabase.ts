import type * as Sqlite from 'node:sqlite';
import type { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Bump when the schema changes. The database is a rebuildable cache of the workspace,
 * so an outdated schema is dropped and recreated rather than migrated.
 */
const schemaVersion = 2;

/**
 * Loaded lazily so a host without `node:sqlite` (Node < 22.5, e.g. some older remote servers)
 * gets a clear error instead of the whole bundle failing to load.
 */
function loadSqlite(): typeof Sqlite {
  try {
    return require('node:sqlite') as typeof Sqlite;
  } catch {
    throw new Error(
      `Sandbox Atlas needs the built-in "node:sqlite" module (Node 22.5+), but this runtime is Node ${process.versions.node}. `
      + 'Update your editor (or its remote server) to a recent version.',
    );
  }
}

/**
 * SQLite connection for Sandbox Atlas, using Node's built-in `node:sqlite`. This avoids
 * native add-ons that must be compiled against each host's exact Node/Electron ABI.
 */
export class AtlasDatabase {
  private readonly db: DatabaseSync;

  /** @param dbPath file path, or ':memory:' for tests. */
  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    this.db = new (loadSqlite().DatabaseSync)(dbPath);
    // Several editor windows can share this file; WAL + busy timeout avoids "database is locked".
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  get connection(): DatabaseSync {
    return this.db;
  }

  /** Runs `fn` inside a transaction, rolling back if it throws. */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    if (this.db.isOpen) {
      this.db.close();
    }
  }

  private migrate(): void {
    const { user_version: currentVersion } = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (currentVersion === schemaVersion) {
      return;
    }

    this.transaction(() => {
      this.db.exec(`
        DROP TABLE IF EXISTS scan_history;
        DROP TABLE IF EXISTS file_map;
        DROP TABLE IF EXISTS parsed_file_data;
        DROP TABLE IF EXISTS doc_summaries;

        CREATE TABLE scan_history (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_root  TEXT NOT NULL,
          scanned_at      INTEGER NOT NULL,
          files_count     INTEGER NOT NULL,
          duration_ms     INTEGER NOT NULL
        );
        CREATE INDEX scan_history_root ON scan_history (workspace_root, scanned_at);

        CREATE TABLE file_map (
          workspace_root  TEXT NOT NULL,
          absolute_path   TEXT NOT NULL,
          relative_path   TEXT NOT NULL,
          extension       TEXT NOT NULL,
          file_size       INTEGER NOT NULL,
          mtime_ms        INTEGER NOT NULL,
          PRIMARY KEY (workspace_root, absolute_path)
        );

        CREATE TABLE parsed_file_data (
          workspace_root      TEXT NOT NULL,
          absolute_path       TEXT NOT NULL,
          relative_path       TEXT NOT NULL,
          imports_json        TEXT NOT NULL,
          exports_json        TEXT NOT NULL,
          components_json     TEXT NOT NULL,
          functions_json      TEXT NOT NULL,
          depends_on_json     TEXT NOT NULL,
          has_default_export  INTEGER NOT NULL,
          lines_of_code       INTEGER NOT NULL,
          parsed_at           INTEGER NOT NULL,
          PRIMARY KEY (workspace_root, absolute_path)
        );

        CREATE TABLE doc_summaries (
          workspace_root          TEXT NOT NULL,
          absolute_path           TEXT NOT NULL,
          relative_path           TEXT NOT NULL,
          sections_json           TEXT NOT NULL,
          word_count              INTEGER NOT NULL,
          has_setup_guide         INTEGER NOT NULL,
          has_architecture_notes  INTEGER NOT NULL,
          has_changelog           INTEGER NOT NULL,
          raw_content             TEXT NOT NULL,
          parsed_at               INTEGER NOT NULL,
          PRIMARY KEY (workspace_root, absolute_path)
        );
      `);
      this.db.exec(`PRAGMA user_version = ${schemaVersion}`);
    });
  }
}
