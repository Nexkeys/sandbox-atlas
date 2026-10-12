import * as vscode from 'vscode';
import { buildGraphData } from '../../core';
import type { GraphToHostMessage, HostToGraphMessage } from '../../shared/graphProtocol';
import type { AtlasSession } from '../atlasSession';
import { webviewHtml, webviewOptions } from './webviewHtml';

/**
 * Interactive dependency graph (Cytoscape.js in a webview). One panel is reused; it follows
 * index changes and lets the user open files, refocus, or run impact analysis from a node.
 */
export class GraphPanel implements vscode.Disposable {
  private static current: GraphPanel | undefined;

  private readonly subscriptions: vscode.Disposable[] = [];
  private webviewReady = false;
  private refreshTimer: NodeJS.Timeout | undefined;

  static show(context: vscode.ExtensionContext, session: AtlasSession, root: string, focus?: string): void {
    if (GraphPanel.current) {
      GraphPanel.current.setTarget(root, focus);
      GraphPanel.current.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel('sandboxAtlas.graph', 'Atlas Graph', vscode.ViewColumn.Active, webviewOptions(context.extensionUri));
    GraphPanel.current = new GraphPanel(panel, context.extensionUri, session, root, focus);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly session: AtlasSession,
    private root: string,
    private focus: string | undefined,
  ) {
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'graph-tab.svg');
    panel.webview.html = webviewHtml(panel.webview, extensionUri, 'graph', 'Atlas Graph');

    this.subscriptions.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((message: GraphToHostMessage) => this.onMessage(message)),
      session.onDidChange(() => this.scheduleRefresh()),
      session.appearance.onDidChange((appearance) => this.post({ type: 'appearance', appearance })),
    );
  }

  dispose(): void {
    GraphPanel.current = undefined;
    clearTimeout(this.refreshTimer);
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.panel.dispose();
  }

  private setTarget(root: string, focus: string | undefined): void {
    this.root = root;
    this.focus = focus;
    this.postGraph();
  }

  private onMessage(message: GraphToHostMessage): void {
    switch (message.type) {
      case 'ready':
        this.webviewReady = true;
        this.post({ type: 'appearance', appearance: this.session.appearance.state });
        this.postGraph();
        break;
      case 'open':
        void vscode.window.showTextDocument(vscode.Uri.file(message.path), { viewColumn: vscode.ViewColumn.Beside, preview: true });
        break;
      case 'focus':
        this.setTarget(this.root, message.path);
        break;
      case 'showAll':
        this.setTarget(this.root, undefined);
        break;
      case 'analyzeImpact':
        void vscode.commands.executeCommand('sandboxAtlas.analyzeImpact', vscode.Uri.file(message.path));
        break;
    }
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.postGraph(), 500);
  }

  private postGraph(): void {
    if (!this.webviewReady) {
      return;
    }
    const data = buildGraphData(this.session.engine.store, this.root, { focus: this.focus });
    this.panel.title = this.focus ? `Atlas Graph: ${data.nodes.find((node) => node.isFocus)?.label ?? ''}` : `Atlas Graph: ${data.workspaceName}`;
    this.post({ type: 'graph', data });
  }

  private post(message: HostToGraphMessage): void {
    void this.panel.webview.postMessage(message);
  }
}
