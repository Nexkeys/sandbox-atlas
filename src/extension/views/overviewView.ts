import * as vscode from 'vscode';
import { isOnlineMode, type IndexStatus } from '../../core';
import { atlasModes } from '../../shared/appearance';
import type { AtlasSession } from '../atlasSession';
import { workspaceRoots } from '../host/workspaceRoots';

interface OverviewItem {
  label: string;
  description?: string;
  icon: string;
  color?: string;
  tooltip?: string;
  command?: vscode.Command;
  children?: OverviewItem[];
}

const statusDisplay: Record<IndexStatus, { label: string; icon: string; color?: string }> = {
  idle: { label: 'Not indexed', icon: 'circle-outline' },
  indexing: { label: 'Indexing…', icon: 'sync~spin' },
  ready: { label: 'Ready', icon: 'pass-filled', color: 'testing.iconPassed' },
  error: { label: 'Error', icon: 'error', color: 'testing.iconFailed' },
};

/** "Overview" sidebar: index health, AI provider, today's usage, and quick actions. */
export class OverviewProvider implements vscode.TreeDataProvider<OverviewItem>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly subscription: vscode.Disposable;

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly session: AtlasSession) {
    this.subscription = session.onDidChange(() => this.changeEmitter.fire());
  }

  getChildren(item?: OverviewItem): OverviewItem[] {
    return item ? item.children ?? [] : this.buildItems();
  }

  getTreeItem(item: OverviewItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      item.label,
      item.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    );
    treeItem.description = item.description;
    treeItem.tooltip = item.tooltip;
    treeItem.command = item.command;
    treeItem.iconPath = new vscode.ThemeIcon(item.icon, item.color ? new vscode.ThemeColor(item.color) : undefined);
    return treeItem;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }

  private buildItems(): OverviewItem[] {
    const { engine } = this.session;
    const roots = workspaceRoots();
    const stats = roots.map((root) => engine.store.getStats(root));
    const totals = stats.reduce(
      (sum, item) => ({ files: sum.files + item.files, code: sum.code + item.codeFiles, docs: sum.docs + item.docFiles }),
      { files: 0, code: 0, docs: 0 },
    );
    const lastScan = Math.max(0, ...stats.map((item) => item.lastScanAt ?? 0));
    const status = statusDisplay[this.session.overallStatus()];

    const config = engine.aiConfig();
    const usage = engine.usage.getToday();
    const limited = isOnlineMode(config.mode) && config.dailyRequestLimit > 0;

    const items: OverviewItem[] = [
      {
        label: 'Index',
        description: `${status.label} · ${totals.files} files`,
        icon: status.icon,
        color: status.color,
        tooltip: `${totals.code} code files, ${totals.docs} docs${lastScan ? `\nLast scan: ${new Date(lastScan).toLocaleString()}` : ''}`,
        command: { command: 'sandboxAtlas.refreshAtlas', title: 'Refresh Atlas' },
      },
      { label: 'Code', description: `${totals.code} files`, icon: 'file-code' },
      { label: 'Docs', description: `${totals.docs} files`, icon: 'book' },
      {
        label: 'AI',
        description: engine.createProvider(config).displayName,
        icon: isOnlineMode(config.mode) ? 'cloud' : 'vm',
        tooltip: 'Click to change the AI provider',
        command: { command: 'sandboxAtlas.selectAiProvider', title: 'Select AI Provider' },
      },
      {
        label: 'Mode',
        description: atlasModes[this.session.appearance.state.mode].label,
        icon: atlasModes[this.session.appearance.state.mode].icon,
        tooltip: 'Click to change how Sandbox Atlas looks',
        command: { command: 'sandboxAtlas.selectMode', title: 'Select Mode' },
      },
      {
        label: 'Today',
        description: `${usage.requests}${limited ? ` / ${config.dailyRequestLimit}` : ''} requests · ${formatTokens(usage.tokens)} tokens`,
        icon: limited && usage.requests >= config.dailyRequestLimit ? 'warning' : 'graph-line',
        tooltip: limited ? 'Daily request limit for online providers (sandboxAtlas.ai.dailyRequestLimit).' : 'Offline usage is not limited.',
      },
    ];

    if (this.session.includesIgnoredFiles) {
      items.push({
        label: 'Ignored files included',
        description: 'this session',
        icon: 'eye',
        color: 'list.warningForeground',
        command: { command: 'sandboxAtlas.allowIgnoredFiles', title: 'Exclude Ignored Files' },
      });
    }

    items.push({
      label: 'Quick actions',
      icon: 'zap',
      children: [
        action('Trace a Feature', 'search', 'sandboxAtlas.traceFeature'),
        action('Dependency Graph', 'type-hierarchy', 'sandboxAtlas.showGraph'),
        action('Project Map', 'map', 'sandboxAtlas.generateProjectMap'),
        action('Summarize Docs', 'book', 'sandboxAtlas.summarizeDocs'),
        action('Export ATLAS.md', 'export', 'sandboxAtlas.exportAtlasNotes'),
        action('Set Up / Check AI', 'wand', 'sandboxAtlas.setupAi'),
      ],
    });

    return items;
  }
}

function action(label: string, icon: string, command: string): OverviewItem {
  return { label, icon, command: { command, title: label } };
}

function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}
