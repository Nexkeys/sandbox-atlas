import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { buildGraphData } from '../../core';
import type { GraphToHostMessage, HostToGraphMessage } from '../../shared/graphProtocol';
import type { AtlasSession } from '../atlasSession';

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

    const panel = vscode.window.createWebviewPanel('sandboxAtlas.graph', 'Atlas Graph', vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
    });
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
    panel.webview.html = renderHtml(panel.webview, extensionUri);

    this.subscriptions.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((message: GraphToHostMessage) => this.onMessage(message)),
      session.onDidChange(() => this.scheduleRefresh()),
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
    const message: HostToGraphMessage = { type: 'graph', data };
    void this.panel.webview.postMessage(message);
  }
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const asset = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', file));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${asset('graph.css')}">
  <title>Atlas Graph</title>
</head>
<body>
  <script nonce="${nonce}" src="${asset('graph.js')}"></script>
</body>
</html>`;
}
