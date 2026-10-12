import * as vscode from 'vscode';
import type { IndexStatus } from '../../core';
import type { AtlasSession } from '../atlasSession';

const display: Record<IndexStatus, { text: string; tooltip: string }> = {
  idle: { text: '$(map) Atlas', tooltip: 'Sandbox Atlas: not indexed yet — click for options' },
  indexing: { text: '$(sync~spin) Atlas', tooltip: 'Sandbox Atlas: indexing in the background' },
  ready: { text: '$(map) Atlas', tooltip: 'Sandbox Atlas: ready' },
  error: { text: '$(warning) Atlas', tooltip: 'Sandbox Atlas: indexing failed — click for details' },
};

/** Workspace-scoped status item (left side) mirroring the index state. */
export class AtlasStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem('sandboxAtlas.status', vscode.StatusBarAlignment.Left, 100);
  private readonly subscription: vscode.Disposable;

  constructor(private readonly session: AtlasSession) {
    this.item.name = 'Sandbox Atlas';
    this.item.command = 'sandboxAtlas.showIndexStatus';
    this.subscription = session.onDidChange(() => this.render());
    this.render();
    this.item.show();
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }

  private render(): void {
    const status = this.session.overallStatus();
    this.item.text = display[status].text;
    this.item.tooltip = display[status].tooltip;
    this.item.backgroundColor = status === 'error' ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
  }
}
