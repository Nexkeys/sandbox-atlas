import * as path from 'path';
import * as vscode from 'vscode';
import { AtlasEngine, describeError, type IndexStatus } from '../core';
import { AtlasSession } from './atlasSession';
import { AutoRefresh } from './autoRefresh';
import { registerAiCommands } from './commands/aiCommands';
import { registerAtlasCommands } from './commands/atlasCommands';
import { registerSettingsCommands } from './commands/settingsCommands';
import { createLogger, createSecretStore, createStateStore, readAiSettings } from './host/vscodePlatform';
import { workspaceRoots } from './host/workspaceRoots';
import { AtlasMapProvider } from './views/atlasMapView';
import { OverviewProvider } from './views/overviewView';
import { AtlasStatusBar } from './views/statusBar';

/** Minimal API returned from activate(); used by integration tests. */
export interface SandboxAtlasApi {
  getIndexStatus(root?: string): IndexStatus | 'unavailable';
}

let engine: AtlasEngine | undefined;

export function activate(context: vscode.ExtensionContext): SandboxAtlasApi {
  const logChannel = vscode.window.createOutputChannel('Sandbox Atlas', { log: true });
  context.subscriptions.push(logChannel);

  try {
    engine = new AtlasEngine({
      databasePath: path.join(context.globalStorageUri.fsPath, 'atlas.sqlite'),
      logger: createLogger(logChannel),
      secrets: createSecretStore(context.secrets),
      state: createStateStore(context.globalState),
      readAiSettings,
    });
  } catch (error) {
    const message = describeError(error);
    logChannel.error(`Sandbox Atlas could not start: ${message}`);
    void vscode.window.showErrorMessage(`Sandbox Atlas could not start: ${message}`);
    return { getIndexStatus: () => 'unavailable' };
  }

  const session = new AtlasSession(engine);
  const atlasMap = new AtlasMapProvider(session);
  const overview = new OverviewProvider(session);

  context.subscriptions.push(
    session,
    atlasMap,
    overview,
    new AtlasStatusBar(session),
    new AutoRefresh(session),
    vscode.window.createTreeView('sandboxAtlas.map', { treeDataProvider: atlasMap, showCollapseAll: true }),
    vscode.window.createTreeView('sandboxAtlas.overview', { treeDataProvider: overview }),
    ...registerAtlasCommands(context, session, logChannel),
    ...registerAiCommands(session),
    ...registerSettingsCommands(session),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void session.indexAll()),
  );

  void session.indexAll();

  return {
    getIndexStatus: (root = workspaceRoots()[0]) => (root ? session.engine.indexer.getStatus(root) : 'idle'),
  };
}

export function deactivate(): void {
  engine?.dispose();
  engine = undefined;
}
