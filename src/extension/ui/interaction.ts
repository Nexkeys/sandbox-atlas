import * as vscode from 'vscode';
import type { AtlasEngine } from '../../core';

/** Opens markdown in VS Code's preview beside the editor. Nothing is written to disk. */
export async function showMarkdown(markdown: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
  await vscode.commands.executeCommand('markdown.showPreviewToSide', document.uri);
}

/** Runs `task` under a cancellable notification; the AbortSignal fires on Cancel. */
export function withCancellableProgress<T>(title: string, task: (signal: AbortSignal) => Promise<T>): Thenable<T> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    async (_progress, token) => {
      const controller = new AbortController();
      const subscription = token.onCancellationRequested(() => controller.abort());
      try {
        return await task(controller.signal);
      } finally {
        subscription.dispose();
      }
    },
  );
}

/**
 * Resolves the file a command should act on: an explicit URI (context menu / tree), the active
 * editor, or a quick-pick of indexed files. Returns undefined when cancelled.
 */
export async function resolveTargetFile(
  engine: AtlasEngine,
  root: string,
  placeHolder: string,
  explicit?: vscode.Uri,
): Promise<string | undefined> {
  const candidate = explicit ?? vscode.window.activeTextEditor?.document.uri;
  if (candidate?.scheme === 'file') {
    return candidate.fsPath;
  }

  const files = engine.store.listFiles(root);
  if (files.length === 0) {
    void vscode.window.showErrorMessage('Sandbox Atlas: No indexed files yet. Run "Sandbox Atlas: Scan Workspace" first.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    files.map((file) => ({
      label: file.relativePath.split('/').pop() ?? file.relativePath,
      description: file.relativePath,
      absolutePath: file.absolutePath,
    })),
    { placeHolder, matchOnDescription: true, ignoreFocusOut: true },
  );
  return picked?.absolutePath;
}

/** Extracts a file URI from command arguments (explorer menus pass Uri, tree items pass nodes). */
export function uriFromArgument(argument: unknown): vscode.Uri | undefined {
  if (argument instanceof vscode.Uri) {
    return argument;
  }
  if (argument && typeof argument === 'object' && 'resourceUri' in argument) {
    const resourceUri = (argument as { resourceUri?: unknown }).resourceUri;
    return resourceUri instanceof vscode.Uri ? resourceUri : undefined;
  }
  return undefined;
}
