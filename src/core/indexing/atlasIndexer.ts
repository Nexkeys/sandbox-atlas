import { describeError, type Logger } from '../platform';
import { parseFiles } from '../parsing/parseFiles';
import type { AtlasStore } from '../storage/atlasStore';
import { Emitter } from '../util/events';
import { scanWorkspace, type ScanOptions } from './workspaceScanner';

export type IndexStatus = 'idle' | 'indexing' | 'ready' | 'error';

export interface IndexResult {
  workspaceRoot: string;
  totalFiles: number;
  filesReparsed: number;
  filesSkipped: number;
  staleRecordsPurged: number;
  durationMs: number;
}

export interface IndexStatusChange {
  workspaceRoot: string;
  status: IndexStatus;
  result?: IndexResult;
  error?: string;
}

/**
 * Keeps the store in sync with the workspace on disk. Re-parses only files whose mtime is
 * newer than their cached parse, and coalesces concurrent requests for the same root.
 */
export class AtlasIndexer {
  private readonly statuses = new Map<string, IndexStatus>();
  private readonly inFlight = new Map<string, Promise<IndexResult>>();
  private readonly statusEmitter = new Emitter<IndexStatusChange>();

  readonly onDidChangeStatus = this.statusEmitter.event;

  constructor(
    private readonly store: AtlasStore,
    private readonly logger: Logger,
  ) {}

  getStatus(workspaceRoot: string): IndexStatus {
    return this.statuses.get(workspaceRoot) ?? 'idle';
  }

  index(workspaceRoot: string, options: ScanOptions = {}): Promise<IndexResult> {
    const running = this.inFlight.get(workspaceRoot);
    if (running) {
      return running;
    }

    const run = this.runIndex(workspaceRoot, options).finally(() => this.inFlight.delete(workspaceRoot));
    this.inFlight.set(workspaceRoot, run);
    return run;
  }

  dispose(): void {
    this.statusEmitter.dispose();
  }

  private async runIndex(workspaceRoot: string, options: ScanOptions): Promise<IndexResult> {
    this.setStatus({ workspaceRoot, status: 'indexing' });
    const startedAt = Date.now();

    try {
      const files = await scanWorkspace(workspaceRoot, options);
      this.store.replaceFileMap(workspaceRoot, files, Date.now() - startedAt);
      const staleRecordsPurged = this.store.purgeStale(workspaceRoot);

      const parsedAt = this.store.getParseTimestamps(workspaceRoot);
      const changed = files.filter((file) => {
        const lastParsedAt = parsedAt.get(file.absolutePath);
        return lastParsedAt === undefined || file.mtimeMs > lastParsedAt;
      });

      const summary = await parseFiles(this.store, workspaceRoot, changed, this.logger);
      const result: IndexResult = {
        workspaceRoot,
        totalFiles: files.length,
        filesReparsed: summary.codeFilesParsed + summary.docFilesParsed,
        filesSkipped: files.length - changed.length,
        staleRecordsPurged,
        durationMs: Date.now() - startedAt,
      };

      this.logger.info(
        `Indexed ${workspaceRoot}: ${result.totalFiles} files, ${result.filesReparsed} re-parsed, `
        + `${result.filesSkipped} unchanged, ${result.staleRecordsPurged} purged, ${result.durationMs}ms.`,
      );
      this.setStatus({ workspaceRoot, status: 'ready', result });
      return result;
    } catch (error) {
      const message = describeError(error);
      this.logger.error(`Indexing failed for ${workspaceRoot}: ${message}`, error);
      this.setStatus({ workspaceRoot, status: 'error', error: message });
      throw error;
    }
  }

  private setStatus(change: IndexStatusChange): void {
    this.statuses.set(change.workspaceRoot, change.status);
    this.statusEmitter.fire(change);
  }
}
