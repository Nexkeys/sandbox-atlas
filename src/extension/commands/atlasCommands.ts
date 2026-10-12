import * as path from 'path';
import * as vscode from 'vscode';
import { buildProjectMap, type IndexStatus } from '../../core';
import type { AtlasSession } from '../atlasSession';
import { resolveRoot } from '../host/workspaceRoots';
import { presentResult, uriFromArgument } from '../ui/interaction';
import { GraphPanel } from '../views/graphPanel';

export function registerAtlasCommands(
  context: vscode.ExtensionContext,
  session: AtlasSession,
  logChannel: vscode.LogOutputChannel,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('sandboxAtlas.scanWorkspace', () => scanWorkspace(session)),
    vscode.commands.registerCommand('sandboxAtlas.refreshAtlas', () => refreshAtlas(session)),
    vscode.commands.registerCommand('sandboxAtlas.generateProjectMap', () => generateProjectMap(session)),
    vscode.commands.registerCommand('sandboxAtlas.exportAtlasNotes', () => exportAtlasNotes(session)),
    vscode.commands.registerCommand('sandboxAtlas.showGraph', () => showGraph(context, session)),
    vscode.commands.registerCommand('sandboxAtlas.showGraphForFile', (argument: unknown) => (
      showGraph(context, session, uriFromArgument(argument) ?? vscode.window.activeTextEditor?.document.uri)
    )),
    vscode.commands.registerCommand('sandboxAtlas.allowIgnoredFiles', () => toggleIgnoredFiles(session)),
    vscode.commands.registerCommand('sandboxAtlas.showIndexStatus', () => showIndexStatus(session)),
    vscode.commands.registerCommand('sandboxAtlas.showLogs', () => logChannel.show()),
    vscode.commands.registerCommand('sandboxAtlas.openWalkthrough', () => vscode.commands.executeCommand(
      'workbench.action.openWalkthrough',
      `${context.extension.id}#sandboxAtlas.gettingStarted`,
      false,
    )),
  ];
}

async function scanWorkspace(session: AtlasSession): Promise<void> {
  const root = await resolveRoot();
  if (root) {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Sandbox Atlas: Scanning' },
      () => session.index(root),
    );
  }
}

async function refreshAtlas(session: AtlasSession): Promise<void> {
  const root = await resolveRoot();
  const result = root && await session.index(root);
  if (result) {
    void vscode.window.showInformationMessage(
      `Sandbox Atlas: Atlas refreshed — ${result.filesReparsed} changed, ${result.staleRecordsPurged} removed, ${result.totalFiles} indexed.`,
    );
  }
}

async function generateProjectMap(session: AtlasSession): Promise<void> {
  const root = await resolveRoot();
  if (root && await session.ensureIndexed(root)) {
    const stats = session.engine.store.getStats(root);
    await presentResult(session, `Project Map: ${path.basename(root)}`, buildProjectMap(session.engine.store, root), `${stats.files} files indexed · no AI used`);
  }
}

async function exportAtlasNotes(session: AtlasSession): Promise<void> {
  const root = await resolveRoot();
  if (!root || !await session.ensureIndexed(root)) {
    return;
  }

  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(root, 'ATLAS.md')),
    filters: { Markdown: ['md'] },
    saveLabel: 'Export Atlas',
  });
  if (!target) {
    return;
  }

  await vscode.workspace.fs.writeFile(target, Buffer.from(buildProjectMap(session.engine.store, root), 'utf8'));
  const selection = await vscode.window.showInformationMessage(
    `Sandbox Atlas: Exported ${path.basename(target.fsPath)}. Share it with your AI editor as project context.`,
    'Open',
  );
  if (selection === 'Open') {
    await vscode.window.showTextDocument(target);
  }
}

async function showGraph(context: vscode.ExtensionContext, session: AtlasSession, focusUri?: vscode.Uri): Promise<void> {
  const root = await resolveRoot(focusUri);
  if (root && await session.ensureIndexed(root)) {
    GraphPanel.show(context, session, root, focusUri?.scheme === 'file' ? focusUri.fsPath : undefined);
  }
}

async function toggleIgnoredFiles(session: AtlasSession): Promise<void> {
  if (session.includesIgnoredFiles) {
    await session.setIncludeIgnored(false);
    void vscode.window.showInformationMessage('Sandbox Atlas: Ignored files are excluded again.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'Include files matched by .gitignore for this session? They may contain generated code or secrets, '
    + 'and their structure can be sent to your AI provider. node_modules, dist and .git stay excluded.',
    { modal: true },
    'Include for This Session',
  );
  if (confirm) {
    await session.setIncludeIgnored(true);
  }
}

async function showIndexStatus(session: AtlasSession): Promise<void> {
  const messages: Record<IndexStatus, string> = {
    idle: 'Sandbox Atlas has not indexed this workspace yet.',
    indexing: 'Sandbox Atlas is indexing your workspace in the background.',
    ready: 'Sandbox Atlas has indexed your workspace. All features are available.',
    error: 'Sandbox Atlas hit an error while indexing.',
  };
  const status = session.overallStatus();
  const actions = status === 'error' ? ['Show Logs', 'Scan Workspace'] : status === 'idle' ? ['Scan Workspace'] : [];
  const selection = await vscode.window.showInformationMessage(messages[status], ...actions);

  if (selection === 'Show Logs') {
    void vscode.commands.executeCommand('sandboxAtlas.showLogs');
  } else if (selection === 'Scan Workspace') {
    void vscode.commands.executeCommand('sandboxAtlas.scanWorkspace');
  }
}
