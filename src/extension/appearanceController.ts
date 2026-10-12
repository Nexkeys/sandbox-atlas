import * as vscode from 'vscode';
import {
  atlasModeIds,
  atlasModes,
  codeFontChoices,
  iconSetIds,
  iconSets,
  isAtlasModeId,
  resolveAppearance,
  uiFontChoices,
  type AppearanceState,
  type AtlasModeId,
  type ResolvedAppearance,
} from '../shared/appearance';

type ApplyColorTheme = 'ask' | 'always' | 'never';

const previousThemeKey = 'sandboxAtlas.previousColorTheme';

/**
 * Owns the active appearance mode: reads settings, previews modes live while the picker is
 * open, and (only with the user's consent) switches VS Code to the matching colour theme,
 * remembering the previous theme so it can be restored.
 */
export class AppearanceController implements vscode.Disposable {
  private preview: Partial<AppearanceState> | undefined;
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
      vscode.commands.registerCommand('sandboxAtlas.customizeAppearance', () => this.customize()),
    );
  }

  get state(): AppearanceState {
    const config = vscode.workspace.getConfiguration('sandboxAtlas.appearance');
    const configured = config.get<string>('mode', 'classic');
    return {
      mode: isAtlasModeId(configured) ? configured : 'classic',
      effects: config.get<boolean>('effects', true),
      uiFont: config.get<string>('uiFont', 'mode'),
      codeFont: config.get<string>('codeFont', 'mode'),
      iconSet: config.get<string>('iconSet', 'mode'),
      ...this.preview,
    };
  }

  /** Mode plus the user's font and icon overrides. */
  get resolved(): ResolvedAppearance {
    return resolveAppearance(this.state);
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
          this.preview = { mode: item.mode };
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

  /** One entry point for everything visual: mode, fonts, icons and effects. */
  private async customize(): Promise<void> {
    const state = this.state;
    const label = (value: string | undefined) => (!value || value === 'mode' ? `${atlasModes[state.mode].label} default` : value);
    const picked = await vscode.window.showQuickPick([
      { id: 'mode', label: '$(paintcan) Mode', description: atlasModes[state.mode].label },
      { id: 'uiFont', label: '$(text-size) Interface font', description: label(state.uiFont) },
      { id: 'codeFont', label: '$(code) Code font', description: label(state.codeFont) },
      { id: 'iconSet', label: '$(symbol-misc) Icon set', description: state.iconSet && state.iconSet !== 'mode' ? iconSets[state.iconSet as keyof typeof iconSets]?.label : label(undefined) },
      { id: 'effects', label: '$(sparkle) Visual effects', description: state.effects ? 'On — click to turn off' : 'Off — click to turn on' },
      { id: 'reset', label: '$(discard) Reset fonts and icons to the mode defaults' },
    ], { title: 'Sandbox Atlas Appearance', placeHolder: 'What would you like to change?' });

    switch (picked?.id) {
      case 'mode':
        return this.pickMode();
      case 'uiFont':
        return this.pickSetting('uiFont', 'Interface font', [...uiFontChoices]);
      case 'codeFont':
        return this.pickSetting('codeFont', 'Code font', [...codeFontChoices]);
      case 'iconSet':
        return this.pickSetting('iconSet', 'Icon set', iconSetIds.map((id) => id), (id) => iconSets[id as keyof typeof iconSets].label);
      case 'effects':
        return this.toggleEffects();
      case 'reset': {
        const config = vscode.workspace.getConfiguration('sandboxAtlas.appearance');
        for (const key of ['uiFont', 'codeFont', 'iconSet']) {
          await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        }
        return;
      }
    }
  }

  /** Picker for a font/icon override with live preview in open Atlas panels and views. */
  private async pickSetting(
    key: 'uiFont' | 'codeFont' | 'iconSet',
    title: string,
    choices: string[],
    labelFor: (value: string) => string = (value) => value,
  ): Promise<void> {
    const current = this.state[key] ?? 'mode';
    const items = [
      { value: 'mode', label: `${atlasModes[this.state.mode].label} default`, description: 'Follow the mode' },
      ...(key === 'iconSet' ? [] : [{ value: 'editor', label: 'VS Code font', description: 'Use your editor/UI font' }]),
      ...choices.map((value) => ({ value, label: labelFor(value), description: key === 'iconSet' ? undefined : 'bundled' })),
    ].map((item) => ({ ...item, label: item.value === current ? `$(check) ${item.label}` : item.label }));

    const quickPick = vscode.window.createQuickPick<(typeof items)[number]>();
    quickPick.title = title;
    quickPick.placeholder = 'Open Atlas panels preview each choice live';
    quickPick.items = items;
    quickPick.activeItems = items.filter((item) => item.value === current);

    const chosen = await new Promise<string | undefined>((resolve) => {
      quickPick.onDidChangeActive(([item]) => {
        if (item) {
          this.preview = { [key]: item.value };
          this.changeEmitter.fire(this.state);
        }
      });
      quickPick.onDidAccept(() => {
        resolve(quickPick.selectedItems[0]?.value);
        quickPick.hide();
      });
      quickPick.onDidHide(() => resolve(undefined));
      quickPick.show();
    });
    quickPick.dispose();
    this.preview = undefined;

    if (chosen) {
      await vscode.workspace.getConfiguration('sandboxAtlas.appearance')
        .update(key, chosen === 'mode' ? undefined : chosen, vscode.ConfigurationTarget.Global);
    }
    this.changeEmitter.fire(this.state);
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
