import * as vscode from 'vscode';
import { describeError, type AtlasEngine, type IndexResult, type IndexStatus } from '../core';
import { workspaceRoots } from './host/workspaceRoots';

/**
 * VS Code-side state around the engine: which roots to index, the session-only
 * "include ignored files" switch, and a single change event that views listen to.
 */
export class AtlasSession implements vscode.Disposable {
  private includeIgnored = false;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[] = [];

  /** Fires when index status, settings, or usage change; views re-render. */
  readonly onDidChange = this.changeEmitter.event;

  constructor(readonly engine: AtlasEngine) {
    const statusSubscription = engine.indexer.onDidChangeStatus(() => this.changeEmitter.fire());
    this.subscriptions.push(
      { dispose: () => statusSubscription.dispose() },
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('sandboxAtlas')) {
          this.changeEmitter.fire();
        }
      }),
      this.changeEmitter,
    );
  }

  get includesIgnoredFiles(): boolean {
    return this.includeIgnored;
  }

  async setIncludeIgnored(value: boolean): Promise<void> {
    this.includeIgnored = value;
    await this.indexAll();
  }

  /** Combined status across roots: any error, else any indexing, else ready/idle. */
  overallStatus(): IndexStatus {
    const statuses = workspaceRoots().map((root) => this.engine.indexer.getStatus(root));
    for (const status of ['error', 'indexing', 'idle'] as const) {
      if (statuses.includes(status)) {
        return status;
      }
    }
    return statuses.length > 0 ? 'ready' : 'idle';
  }

  /** Indexes one root. Errors are logged and reported; returns undefined on failure. */
  async index(root: string): Promise<IndexResult | undefined> {
    try {
      return await this.engine.indexer.index(root, { includeIgnored: this.includeIgnored });
    } catch (error) {
      const selection = await vscode.window.showErrorMessage(
        `Sandbox Atlas: Indexing failed — ${describeError(error)}`,
        'Show Logs',
      );
      if (selection === 'Show Logs') {
        void vscode.commands.executeCommand('sandboxAtlas.showLogs');
      }
      return undefined;
    }
  }

  async indexAll(): Promise<void> {
    for (const root of workspaceRoots()) {
      await this.index(root);
    }
  }

  /** Waits for (or starts) indexing so AI features never run against a missing or partial index. */
  async ensureIndexed(root: string): Promise<boolean> {
    if (this.engine.indexer.getStatus(root) === 'ready') {
      return true;
    }

    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Sandbox Atlas: Indexing workspace' },
      () => this.index(root),
    );
    return result !== undefined;
  }

  /** Notifies views of a change the engine cannot see (e.g. usage recorded, key stored). */
  refreshViews(): void {
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }
}
