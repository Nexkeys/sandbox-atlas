import * as vscode from 'vscode';
import type { IndexStatus } from '../../core';
import { atlasModes } from '../../shared/appearance';
import type { AtlasSession } from '../atlasSession';

const tooltips: Record<IndexStatus, string> = {
  idle: 'not indexed yet — click for options',
  indexing: 'indexing in the background',
  ready: 'ready',
  error: 'indexing failed — click for details',
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
    const mode = atlasModes[this.session.appearance.state.mode];
    const icon = status === 'indexing' ? 'sync~spin' : status === 'error' ? 'warning' : mode.icon;
    this.item.text = `$(${icon}) Atlas`;
    this.item.tooltip = `Sandbox Atlas (${mode.label} mode): ${tooltips[status]}`;
    this.item.backgroundColor = status === 'error' ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
  }
}
