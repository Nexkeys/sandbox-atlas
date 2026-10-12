import * as vscode from 'vscode';

/** Local workspace folders Sandbox Atlas can index (virtual/remote-scheme folders are skipped). */
export function workspaceRoots(): string[] {
  return (vscode.workspace.workspaceFolders ?? [])
    .filter((folder) => folder.uri.scheme === 'file')
    .map((folder) => folder.uri.fsPath);
}

/** The workspace root containing `uri`, if any. */
export function rootForUri(uri: vscode.Uri | undefined): string | undefined {
  if (!uri || uri.scheme !== 'file') {
    return undefined;
  }
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder?.uri.scheme === 'file' ? folder.uri.fsPath : undefined;
}

/**
 * The root to act on: the one containing the active editor, the only root, or — in a
 * multi-root workspace with no active file — the user's pick. Undefined when cancelled or none.
 */
export async function resolveRoot(preferredUri?: vscode.Uri): Promise<string | undefined> {
  const roots = workspaceRoots();
  if (roots.length === 0) {
    void vscode.window.showWarningMessage('Sandbox Atlas: Open a local project folder first.');
    return undefined;
  }

  const fromUri = rootForUri(preferredUri) ?? rootForUri(vscode.window.activeTextEditor?.document.uri);
  if (fromUri) {
    return fromUri;
  }
  if (roots.length === 1) {
    return roots[0];
  }

  const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Which workspace folder?' });
  return picked?.uri.fsPath;
}
