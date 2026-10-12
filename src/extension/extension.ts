import * as path from 'path';
import * as vscode from 'vscode';
import { AtlasEngine, describeError, type IndexStatus } from '../core';
import { AppearanceController } from './appearanceController';
import { AtlasSession } from './atlasSession';
import { AutoRefresh } from './autoRefresh';
import { registerAiCommands } from './commands/aiCommands';
import { registerAiSetupCommands } from './commands/aiSetup';
import { registerAtlasCommands } from './commands/atlasCommands';
import { registerSettingsCommands } from './commands/settingsCommands';
import { createLogger, createSecretStore, createStateStore, readAiSettings } from './host/vscodePlatform';
import { workspaceRoots } from './host/workspaceRoots';
import { uriFromArgument } from './ui/interaction';
import { AtlasMapProvider } from './views/atlasMapView';
import { ChatViewProvider } from './views/chatView';
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

  const appearance = new AppearanceController(context.globalState);
  const session = new AtlasSession(engine, appearance, context.extensionUri);
  const atlasMap = new AtlasMapProvider(session);
  const overview = new OverviewProvider(session);
  const chat = new ChatViewProvider(session, context.workspaceState);

  context.subscriptions.push(
    appearance,
    session,
    atlasMap,
    overview,
    chat,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chat),
    vscode.commands.registerCommand('sandboxAtlas.openChat', () => chat.open()),
    vscode.commands.registerCommand('sandboxAtlas.askAboutFile', (argument: unknown) => chat.open(
      uriFromArgument(argument) ?? vscode.window.activeTextEditor?.document.uri,
      'What does this file do, and how does it fit into the project?',
    )),
    new AtlasStatusBar(session),
    new AutoRefresh(session),
    vscode.window.createTreeView('sandboxAtlas.map', { treeDataProvider: atlasMap, showCollapseAll: true }),
    vscode.window.createTreeView('sandboxAtlas.overview', { treeDataProvider: overview }),
    ...registerAtlasCommands(context, session, logChannel),
    ...registerAiCommands(session),
    ...registerAiSetupCommands(session),
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
