import * as path from 'path';
import * as vscode from 'vscode';
import { isSafeHref, renderMarkdown } from '../../core/util/markdown';
import type { HostToResultsMessage, ResultsToHostMessage } from '../../shared/resultsProtocol';
import type { AppearanceController } from '../appearanceController';
import { webviewHtml, webviewOptions } from './webviewHtml';

export interface ResultContent {
  title: string;
  subtitle?: string;
  markdown: string;
  /** Suggested file name for Save. */
  fileName: string;
}

/**
 * "Atlas Results" panel: AI answers and project maps rendered in the active appearance mode,
 * with copy / open-as-markdown / save actions. One panel is reused.
 */
export class ResultsPanel implements vscode.Disposable {
  private static current: ResultsPanel | undefined;

  private readonly subscriptions: vscode.Disposable[] = [];
  private ready = false;
  private content: ResultContent | undefined;

  static async show(extensionUri: vscode.Uri, appearance: AppearanceController, content: ResultContent): Promise<void> {
    if (!ResultsPanel.current) {
      const panel = vscode.window.createWebviewPanel(
        'sandboxAtlas.results',
        content.title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { ...webviewOptions(extensionUri), retainContextWhenHidden: false },
      );
      ResultsPanel.current = new ResultsPanel(panel, extensionUri, appearance);
    }
    await ResultsPanel.current.setContent(content);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly appearance: AppearanceController,
  ) {
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'graph-tab.svg');
    panel.webview.html = webviewHtml(panel.webview, extensionUri, 'results', 'Atlas Results');
    this.subscriptions.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((message: ResultsToHostMessage) => this.onMessage(message)),
      appearance.onDidChange((state) => this.post({ type: 'appearance', appearance: state })),
    );
  }

  dispose(): void {
    ResultsPanel.current = undefined;
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.panel.dispose();
  }

  private async setContent(content: ResultContent): Promise<void> {
    this.content = content;
    this.panel.title = content.title;
    this.panel.reveal(undefined, false);
    await this.postContent();
  }

  private async postContent(): Promise<void> {
    if (!this.ready || !this.content) {
      return;
    }
    // Drop the leading "# Title" — the panel header shows it.
    const body = this.content.markdown.replace(/^#\s.*\n+/, '');
    this.post({
      type: 'result',
      result: { title: this.content.title, subtitle: this.content.subtitle, html: await renderMarkdown(body) },
    });
  }

  private async onMessage(message: ResultsToHostMessage): Promise<void> {
    const content = this.content;
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.post({ type: 'appearance', appearance: this.appearance.state });
        await this.postContent();
        break;
      case 'copy':
        if (content) {
          await vscode.env.clipboard.writeText(content.markdown);
        }
        break;
      case 'openMarkdown':
        if (content) {
          const document = await vscode.workspace.openTextDocument({ content: content.markdown, language: 'markdown' });
          await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
        }
        break;
      case 'save':
        if (content) {
          await saveMarkdown(content);
        }
        break;
      case 'openLink':
        // Re-validate on the host: never trust the webview.
        if (isSafeHref(message.href)) {
          await vscode.env.openExternal(vscode.Uri.parse(message.href));
        }
        break;
    }
  }

  private post(message: HostToResultsMessage): void {
    void this.panel.webview.postMessage(message);
  }
}

async function saveMarkdown(content: ResultContent): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const target = await vscode.window.showSaveDialog({
    defaultUri: folder ? vscode.Uri.joinPath(folder, content.fileName) : undefined,
    filters: { Markdown: ['md'] },
  });
  if (target) {
    await vscode.workspace.fs.writeFile(target, Buffer.from(content.markdown, 'utf8'));
    void vscode.window.showInformationMessage(`Sandbox Atlas: Saved ${path.basename(target.fsPath)}.`);
  }
}

/** Short safe file name from a title, e.g. "Impact Analysis: src/a.ts" → "impact-analysis-src-a-ts.md". */
export function fileNameFor(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${slug || 'atlas-result'}.md`;
}
