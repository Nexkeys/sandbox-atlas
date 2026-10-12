import * as vscode from 'vscode';
import { atlasModeIds, atlasModes, isAtlasModeId, type AppearanceState, type AtlasModeId } from '../shared/appearance';

type ApplyColorTheme = 'ask' | 'always' | 'never';

const previousThemeKey = 'sandboxAtlas.previousColorTheme';

/**
 * Owns the active appearance mode: reads settings, previews modes live while the picker is
 * open, and (only with the user's consent) switches VS Code to the matching colour theme,
 * remembering the previous theme so it can be restored.
 */
export class AppearanceController implements vscode.Disposable {
  private preview: AtlasModeId | undefined;
  private readonly changeEmitter = new vscode.EventEmitter<AppearanceState>();
  private readonly subscriptions: vscode.Disposable[] = [];

  /** Fires with the state webviews and views should render. */
  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly memento: vscode.Memento) {
    this.subscriptions.push(
      this.changeEmitter,
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('sandboxAtlas.appearance')) {
          this.changeEmitter.fire(this.state);
        }
      }),
      vscode.commands.registerCommand('sandboxAtlas.selectMode', () => this.pickMode()),
      vscode.commands.registerCommand('sandboxAtlas.toggleEffects', () => this.toggleEffects()),
    );
  }

  get state(): AppearanceState {
    const config = vscode.workspace.getConfiguration('sandboxAtlas.appearance');
    const configured = config.get<string>('mode', 'classic');
    return {
      mode: this.preview ?? (isAtlasModeId(configured) ? configured : 'classic'),
      effects: config.get<boolean>('effects', true),
    };
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  private async pickMode(): Promise<void> {
    const current = this.state.mode;
    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { mode: AtlasModeId }>();
    quickPick.title = 'Sandbox Atlas Mode';
    quickPick.placeholder = 'Pick a mode — open Atlas panels preview it as you move through the list';
    quickPick.items = atlasModeIds.map((id) => ({
      mode: id,
      label: `$(${atlasModes[id].icon}) ${atlasModes[id].label}`,
      description: id === current ? 'current' : undefined,
      detail: atlasModes[id].description,
    }));
    quickPick.activeItems = quickPick.items.filter((item) => item.mode === current);

    const chosen = await new Promise<AtlasModeId | undefined>((resolve) => {
      quickPick.onDidChangeActive(([item]) => {
        if (item) {
          this.preview = item.mode;
          this.changeEmitter.fire(this.state);
        }
      });
      quickPick.onDidAccept(() => {
        resolve(quickPick.selectedItems[0]?.mode);
        quickPick.hide();
      });
      quickPick.onDidHide(() => resolve(undefined));
      quickPick.show();
    });
    quickPick.dispose();
    this.preview = undefined;

    if (!chosen) {
      this.changeEmitter.fire(this.state); // revert the preview
      return;
    }

    await vscode.workspace.getConfiguration('sandboxAtlas.appearance').update('mode', chosen, vscode.ConfigurationTarget.Global);
    this.changeEmitter.fire(this.state);
    await this.syncColorTheme(chosen);
  }

  private async toggleEffects(): Promise<void> {
    const config = vscode.workspace.getConfiguration('sandboxAtlas.appearance');
    await config.update('effects', !config.get<boolean>('effects', true), vscode.ConfigurationTarget.Global);
  }

  /** Offers (or applies, per settings) the colour theme that matches `mode`. Never silent. */
  private async syncColorTheme(mode: AtlasModeId): Promise<void> {
    const appearance = vscode.workspace.getConfiguration('sandboxAtlas.appearance');
    const workbench = vscode.workspace.getConfiguration('workbench');
    const preference = appearance.get<ApplyColorTheme>('applyColorTheme', 'ask');
    const currentTheme = workbench.get<string>('colorTheme');
    const target = atlasModes[mode].colorTheme;
    const onAtlasTheme = atlasModeIds.some((id) => atlasModes[id].colorTheme === currentTheme);

    if (!target) {
      // Back to Classic: restore the user's own theme if an Atlas theme is active.
      const previous = this.memento.get<string>(previousThemeKey);
      if (onAtlasTheme && previous && preference !== 'never') {
        await workbench.update('colorTheme', previous, vscode.ConfigurationTarget.Global);
      }
      return;
    }

    if (preference === 'never' || currentTheme === target) {
      return;
    }

    if (preference === 'ask') {
      const choice = await vscode.window.showInformationMessage(
        `Also switch VS Code to the "${target}" colour theme? You can switch back any time (Classic mode restores your theme).`,
        'Apply Theme',
        'Atlas Panels Only',
        'Never Ask',
      );
      if (choice === 'Never Ask') {
        await appearance.update('applyColorTheme', 'never', vscode.ConfigurationTarget.Global);
      }
      if (choice !== 'Apply Theme') {
        return;
      }
    }

    if (!onAtlasTheme && currentTheme) {
      await this.memento.update(previousThemeKey, currentTheme);
    }
    await workbench.update('colorTheme', target, vscode.ConfigurationTarget.Global);
  }
}
