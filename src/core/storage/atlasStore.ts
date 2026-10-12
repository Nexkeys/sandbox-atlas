import type {
  CodeFileRecord,
  ComponentData,
  DocRecord,
  DocSectionData,
  ExportData,
  FileRecord,
  FunctionData,
  ImportData,
  WorkspaceStats,
} from '../model';
import { type AtlasDatabase } from './atlasDatabase';

interface FileRow {
  absolute_path: string;
  relative_path: string;
  extension: string;
  file_size: number;
  mtime_ms: number;
}

interface CodeRow {
  absolute_path: string;
  relative_path: string;
  imports_json: string;
  exports_json: string;
  components_json: string;
  functions_json: string;
  depends_on_json: string;
  has_default_export: number;
  lines_of_code: number;
  parsed_at: number;
}

interface DocRow {
  absolute_path: string;
  relative_path: string;
  sections_json: string;
  word_count: number;
  has_setup_guide: number;
  has_architecture_notes: number;
  has_changelog: number;
  raw_content: string;
  parsed_at: number;
}

/** Code files carry ast data; docs carry doc data. */
export type ParseResultEntry =
  | { kind: 'code'; record: Omit<CodeFileRecord, 'parsedAt'> }
  | { kind: 'doc'; record: Omit<DocRecord, 'parsedAt'> };

/**
 * Typed repository over the Atlas database. Every SQL statement in the engine lives here,
 * so the rest of the code works with plain records.
 */
export class AtlasStore {
  constructor(private readonly database: AtlasDatabase) {}

  close(): void {
    this.database.close();
  }

  // ── File map ────────────────────────────────────────────────────────────────

  replaceFileMap(workspaceRoot: string, files: FileRecord[], durationMs: number): void {
    const db = this.database.connection;
    const insert = db.prepare(`
      INSERT INTO file_map (workspace_root, absolute_path, relative_path, extension, file_size, mtime_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.database.transaction(() => {
      db.prepare('DELETE FROM file_map WHERE workspace_root = ?').run(workspaceRoot);
      files.forEach((file) => {
        insert.run(workspaceRoot, file.absolutePath, file.relativePath, file.extension, file.fileSize, file.mtimeMs);
      });
      db.prepare('INSERT INTO scan_history (workspace_root, scanned_at, files_count, duration_ms) VALUES (?, ?, ?, ?)')
        .run(workspaceRoot, Date.now(), files.length, durationMs);
    });
  }

  listFiles(workspaceRoot: string): FileRecord[] {
    const rows = this.database.connection
      .prepare('SELECT * FROM file_map WHERE workspace_root = ? ORDER BY relative_path')
      .all(workspaceRoot) as unknown as FileRow[];
    return rows.map(toFileRecord);
  }

  getFile(workspaceRoot: string, absolutePath: string): FileRecord | undefined {
    const row = this.database.connection
      .prepare('SELECT * FROM file_map WHERE workspace_root = ? AND absolute_path = ?')
      .get(workspaceRoot, absolutePath) as unknown as FileRow | undefined;
    return row ? toFileRecord(row) : undefined;
  }

  // ── Parse results ───────────────────────────────────────────────────────────

  /** Last parse time per file (code and docs), used to skip unchanged files. */
  getParseTimestamps(workspaceRoot: string): Map<string, number> {
    const rows = this.database.connection.prepare(`
      SELECT absolute_path, parsed_at FROM parsed_file_data WHERE workspace_root = ?
      UNION ALL
      SELECT absolute_path, parsed_at FROM doc_summaries WHERE workspace_root = ?
    `).all(workspaceRoot, workspaceRoot) as unknown as Array<{ absolute_path: string; parsed_at: number }>;
    return new Map(rows.map((row) => [row.absolute_path, row.parsed_at]));
  }

  saveParseResults(workspaceRoot: string, entries: ParseResultEntry[]): void {
    const db = this.database.connection;
    const insertCode = db.prepare(`
      INSERT OR REPLACE INTO parsed_file_data (
        workspace_root, absolute_path, relative_path, imports_json, exports_json, components_json,
        functions_json, depends_on_json, has_default_export, lines_of_code, parsed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertDoc = db.prepare(`
      INSERT OR REPLACE INTO doc_summaries (
        workspace_root, absolute_path, relative_path, sections_json, word_count, has_setup_guide,
        has_architecture_notes, has_changelog, raw_content, parsed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const parsedAt = Date.now();

    this.database.transaction(() => {
      entries.forEach((entry) => {
        if (entry.kind === 'code') {
          const code = entry.record;
          insertCode.run(
            workspaceRoot, code.absolutePath, code.relativePath,
            JSON.stringify(code.imports), JSON.stringify(code.exports), JSON.stringify(code.components),
            JSON.stringify(code.functions), JSON.stringify(code.dependsOn),
            code.hasDefaultExport ? 1 : 0, code.linesOfCode, parsedAt,
          );
        } else {
          const doc = entry.record;
          insertDoc.run(
            workspaceRoot, doc.absolutePath, doc.relativePath, JSON.stringify(doc.sections), doc.wordCount,
            doc.hasSetupGuide ? 1 : 0, doc.hasArchitectureNotes ? 1 : 0, doc.hasChangelog ? 1 : 0,
            doc.rawContent, parsedAt,
          );
        }
      });
    });
  }

  /** Removes parse results for files no longer in the file map. Returns the number removed. */
  purgeStale(workspaceRoot: string): number {
    const db = this.database.connection;
    const orphaned = 'absolute_path NOT IN (SELECT absolute_path FROM file_map WHERE workspace_root = ?)';
    return this.database.transaction(() => {
      const code = db.prepare(`DELETE FROM parsed_file_data WHERE workspace_root = ? AND ${orphaned}`).run(workspaceRoot, workspaceRoot);
      const docs = db.prepare(`DELETE FROM doc_summaries WHERE workspace_root = ? AND ${orphaned}`).run(workspaceRoot, workspaceRoot);
      return Number(code.changes) + Number(docs.changes);
    });
  }

  listCodeFiles(workspaceRoot: string): CodeFileRecord[] {
    const rows = this.database.connection
      .prepare('SELECT * FROM parsed_file_data WHERE workspace_root = ? ORDER BY relative_path')
      .all(workspaceRoot) as unknown as CodeRow[];

    return rows.map((row) => ({
      absolutePath: row.absolute_path,
      relativePath: row.relative_path,
      imports: parseJsonArray<ImportData>(row.imports_json),
      exports: parseJsonArray<ExportData>(row.exports_json),
      components: parseJsonArray<ComponentData>(row.components_json),
      functions: parseJsonArray<FunctionData>(row.functions_json),
      dependsOn: parseJsonArray<string>(row.depends_on_json),
      hasDefaultExport: row.has_default_export === 1,
      linesOfCode: row.lines_of_code,
      parsedAt: row.parsed_at,
    }));
  }

  listDocs(workspaceRoot: string): DocRecord[] {
    const rows = this.database.connection
      .prepare('SELECT * FROM doc_summaries WHERE workspace_root = ? ORDER BY relative_path')
      .all(workspaceRoot) as unknown as DocRow[];

    return rows.map((row) => ({
      absolutePath: row.absolute_path,
      relativePath: row.relative_path,
      sections: parseJsonArray<DocSectionData>(row.sections_json),
      wordCount: row.word_count,
      hasSetupGuide: row.has_setup_guide === 1,
      hasArchitectureNotes: row.has_architecture_notes === 1,
      hasChangelog: row.has_changelog === 1,
      rawContent: row.raw_content,
      parsedAt: row.parsed_at,
    }));
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  getStats(workspaceRoot: string): WorkspaceStats {
    const db = this.database.connection;
    const count = (table: string) => (
      db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE workspace_root = ?`).get(workspaceRoot) as { n: number }
    ).n;
    const lastScan = db
      .prepare('SELECT scanned_at, duration_ms FROM scan_history WHERE workspace_root = ? ORDER BY scanned_at DESC LIMIT 1')
      .get(workspaceRoot) as { scanned_at: number; duration_ms: number } | undefined;

    return {
      files: count('file_map'),
      codeFiles: count('parsed_file_data'),
      docFiles: count('doc_summaries'),
      lastScanAt: lastScan?.scanned_at,
      lastScanDurationMs: lastScan?.duration_ms,
    };
  }
}

function toFileRecord(row: FileRow): FileRecord {
  return {
    absolutePath: row.absolute_path,
    relativePath: row.relative_path,
    extension: row.extension,
    fileSize: row.file_size,
    mtimeMs: row.mtime_ms,
  };
}

function parseJsonArray<T>(jsonText: string): T[] {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}
