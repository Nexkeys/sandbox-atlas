import * as vscode from 'vscode';
import { isIndexablePath } from '../core';
import type { AtlasSession } from './atlasSession';
import { isAutoRefreshEnabled } from './host/vscodePlatform';
import { rootForUri } from './host/workspaceRoots';

const debounceMs = 1500;

/**
 * Re-indexes a workspace root shortly after indexable files (or .gitignore) change on disk.
 * Indexing is incremental, so only the changed files are re-parsed.
 */
export class AutoRefresh implements vscode.Disposable {
  private readonly watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx,mjs,cjs,md,markdown,mdx}');
  private readonly gitignoreWatcher = vscode.workspace.createFileSystemWatcher('**/.gitignore');
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly session: AtlasSession) {
    const onChange = (uri: vscode.Uri) => this.schedule(uri);
    [this.watcher, this.gitignoreWatcher].forEach((watcher) => {
      watcher.onDidCreate(onChange);
      watcher.onDidChange(onChange);
      watcher.onDidDelete(onChange);
    });
  }

  dispose(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.watcher.dispose();
    this.gitignoreWatcher.dispose();
  }

  private schedule(uri: vscode.Uri): void {
    const isGitignore = uri.path.endsWith('/.gitignore');
    if (!isAutoRefreshEnabled() || (!isGitignore && !isIndexablePath(uri.fsPath)) || /[\\/](node_modules|\.git|dist|out)[\\/]/.test(uri.fsPath)) {
      return;
    }

    const root = rootForUri(uri);
    if (!root || this.session.engine.indexer.getStatus(root) === 'idle') {
      return;
    }

    clearTimeout(this.timers.get(root));
    this.timers.set(root, setTimeout(() => {
      this.timers.delete(root);
      void this.session.index(root);
    }, debounceMs));
  }
}
