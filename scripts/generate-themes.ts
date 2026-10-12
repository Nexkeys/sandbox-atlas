/**
 * Generates the VS Code colour themes that match each appearance mode, from the single source of
 * truth in src/shared/appearance.ts. Run with `npm run themes` (Node 22.18+ strips TS types).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { atlasModeIds, atlasModes, type AtlasMode, type ModePalette } from '../src/shared/appearance.ts';

/** `#rrggbb` + alpha (0–1) → `#rrggbbaa`. */
function alpha(hex: string, amount: number): string {
  return `${hex}${Math.round(amount * 255).toString(16).padStart(2, '0')}`;
}

/** Linear blend of two `#rrggbb` colours. */
function mix(from: string, to: string, amount: number): string {
  const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `#${[0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount)
    .toString(16).padStart(2, '0')).join('')}`;
}

const ansi = {
  dark: {
    black: '#1f2430', red: '#f87171', green: '#4ade80', yellow: '#facc15', blue: '#60a5fa', magenta: '#e879f9', cyan: '#22d3ee', white: '#e5e7eb',
    brightBlack: '#6b7280', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#f0abfc', brightCyan: '#67e8f9', brightWhite: '#ffffff',
  },
  light: {
    black: '#1f2937', red: '#b91c1c', green: '#15803d', yellow: '#a16207', blue: '#1d4ed8', magenta: '#a21caf', cyan: '#0e7490', white: '#6b7280',
    brightBlack: '#4b5563', brightRed: '#dc2626', brightGreen: '#16a34a', brightYellow: '#ca8a04', brightBlue: '#2563eb', brightMagenta: '#c026d3', brightCyan: '#0891b2', brightWhite: '#374151',
  },
};

function workbenchColors(palette: ModePalette, light: boolean): Record<string, string> {
  const { background, surface, surfaceAlt, border, text, muted, accent, accentText, focus } = palette;
  const error = light ? '#b91c1c' : '#f87171';
  const warning = light ? '#a16207' : '#facc15';
  const terminal = light ? ansi.light : ansi.dark;

  return {
    focusBorder: focus,
    foreground: text,
    descriptionForeground: muted,
    errorForeground: error,
    'icon.foreground': muted,
    'selection.background': alpha(accent, 0.35),
    'widget.border': border,
    'widget.shadow': light ? '#00000022' : '#00000066',
    'textLink.foreground': focus,
    'textLink.activeForeground': accent,

    'activityBar.background': surface,
    'activityBar.foreground': text,
    'activityBar.inactiveForeground': muted,
    'activityBar.activeBorder': accent,
    'activityBar.border': border,
    'activityBarBadge.background': accent,
    'activityBarBadge.foreground': accentText,

    'sideBar.background': surface,
    'sideBar.foreground': text,
    'sideBar.border': border,
    'sideBarTitle.foreground': text,
    'sideBarSectionHeader.background': surfaceAlt,
    'sideBarSectionHeader.foreground': text,
    'sideBarSectionHeader.border': border,

    'list.activeSelectionBackground': alpha(accent, 0.28),
    'list.activeSelectionForeground': text,
    'list.inactiveSelectionBackground': alpha(accent, 0.16),
    'list.hoverBackground': surfaceAlt,
    'list.focusOutline': focus,
    'list.focusBackground': alpha(accent, 0.2),
    'list.highlightForeground': accent,

    'editor.background': background,
    'editor.foreground': text,
    'editorLineNumber.foreground': mix(muted, background, 0.35),
    'editorLineNumber.activeForeground': text,
    'editorCursor.foreground': accent,
    'editor.selectionBackground': alpha(accent, 0.3),
    'editor.inactiveSelectionBackground': alpha(accent, 0.15),
    'editor.selectionHighlightBackground': alpha(focus, 0.18),
    'editor.lineHighlightBackground': alpha(text, light ? 0.05 : 0.06),
    'editor.findMatchBackground': alpha(focus, 0.4),
    'editor.findMatchHighlightBackground': alpha(focus, 0.2),
    'editor.wordHighlightBackground': alpha(accent, 0.16),
    'editorIndentGuide.background1': alpha(border, 0.7),
    'editorIndentGuide.activeBackground1': muted,
    'editorWhitespace.foreground': alpha(muted, 0.4),
    'editorBracketMatch.border': accent,
    'editorBracketMatch.background': alpha(accent, 0.12),
    'editorGutter.background': background,
    'editorError.foreground': error,
    'editorWarning.foreground': warning,
    'editorInfo.foreground': focus,
    'editorWidget.background': surface,
    'editorWidget.border': border,
    'editorSuggestWidget.background': surface,
    'editorSuggestWidget.border': border,
    'editorSuggestWidget.selectedBackground': alpha(accent, 0.25),
    'editorSuggestWidget.highlightForeground': accent,
    'editorHoverWidget.background': surface,
    'editorHoverWidget.border': border,
    'editorOverviewRuler.border': border,
    'breadcrumb.foreground': muted,
    'breadcrumb.focusForeground': text,

    'editorGroupHeader.tabsBackground': surface,
    'editorGroupHeader.tabsBorder': border,
    'editorGroup.border': border,
    'tab.activeBackground': background,
    'tab.activeForeground': text,
    'tab.activeBorderTop': accent,
    'tab.inactiveBackground': surface,
    'tab.inactiveForeground': muted,
    'tab.hoverBackground': surfaceAlt,
    'tab.border': border,

    'titleBar.activeBackground': surface,
    'titleBar.activeForeground': text,
    'titleBar.inactiveBackground': surface,
    'titleBar.inactiveForeground': muted,
    'titleBar.border': border,

    'statusBar.background': surface,
    'statusBar.foreground': text,
    'statusBar.border': border,
    'statusBar.noFolderBackground': surface,
    'statusBar.debuggingBackground': accent,
    'statusBar.debuggingForeground': accentText,
    'statusBarItem.hoverBackground': surfaceAlt,
    'statusBarItem.remoteBackground': accent,
    'statusBarItem.remoteForeground': accentText,

    'panel.background': surface,
    'panel.border': border,
    'panelTitle.activeForeground': text,
    'panelTitle.activeBorder': accent,
    'panelTitle.inactiveForeground': muted,

    'terminal.background': background,
    'terminal.foreground': text,
    'terminalCursor.foreground': accent,
    ...Object.fromEntries(Object.entries(terminal).map(([name, color]) => [`terminal.ansi${name[0].toUpperCase()}${name.slice(1)}`, color])),

    'button.background': accent,
    'button.foreground': accentText,
    'button.hoverBackground': mix(accent, light ? '#000000' : '#ffffff', 0.12),
    'button.secondaryBackground': surfaceAlt,
    'button.secondaryForeground': text,
    'button.secondaryHoverBackground': mix(surfaceAlt, text, 0.1),
    'input.background': light ? surface : surfaceAlt,
    'input.foreground': text,
    'input.border': border,
    'input.placeholderForeground': muted,
    'inputOption.activeBorder': accent,
    'dropdown.background': surface,
    'dropdown.foreground': text,
    'dropdown.border': border,
    'checkbox.background': surfaceAlt,
    'checkbox.border': border,
    'badge.background': accent,
    'badge.foreground': accentText,
    'progressBar.background': accent,
    'scrollbarSlider.background': alpha(muted, 0.2),
    'scrollbarSlider.hoverBackground': alpha(muted, 0.35),
    'scrollbarSlider.activeBackground': alpha(muted, 0.5),

    'quickInput.background': surface,
    'quickInput.foreground': text,
    'quickInputList.focusBackground': alpha(accent, 0.25),
    'pickerGroup.foreground': accent,
    'notifications.background': surface,
    'notifications.foreground': text,
    'notifications.border': border,
    'menu.background': surface,
    'menu.foreground': text,
    'menu.selectionBackground': alpha(accent, 0.25),
    'menu.border': border,

    'gitDecoration.modifiedResourceForeground': palette.syntax.number,
    'gitDecoration.untrackedResourceForeground': palette.syntax.string,
    'gitDecoration.addedResourceForeground': palette.syntax.string,
    'gitDecoration.deletedResourceForeground': error,
  };
}

function tokenColors(palette: ModePalette): Array<{ name: string; scope: string[]; settings: Record<string, string> }> {
  const { syntax } = palette;
  const rule = (name: string, scope: string[], foreground: string, fontStyle?: string) => ({
    name,
    scope,
    settings: fontStyle ? { foreground, fontStyle } : { foreground },
  });

  return [
    rule('Comments', ['comment', 'punctuation.definition.comment'], syntax.comment, 'italic'),
    rule('Keywords', ['keyword', 'keyword.control', 'storage', 'storage.type', 'storage.modifier'], syntax.keyword),
    rule('Operators', ['keyword.operator', 'punctuation.separator', 'punctuation.terminator'], syntax.operator),
    rule('Strings', ['string', 'string.quoted', 'string.template', 'punctuation.definition.string'], syntax.string),
    rule('Numbers', ['constant.numeric'], syntax.number),
    rule('Constants', ['constant.language', 'constant.character', 'support.constant', 'variable.other.constant', 'variable.other.enummember'], syntax.constant),
    rule('Functions', ['entity.name.function', 'support.function', 'meta.function-call entity.name.function'], syntax.function),
    rule('Types', ['entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'entity.other.inherited-class', 'storage.type.class'], syntax.type),
    rule('Variables', ['variable', 'variable.other.readwrite', 'meta.definition.variable'], syntax.variable),
    rule('Parameters', ['variable.parameter'], syntax.variable, 'italic'),
    rule('Properties', ['variable.other.property', 'support.variable.property', 'meta.object-literal.key', 'entity.name.tag.yaml'], syntax.property),
    rule('Tags', ['entity.name.tag', 'punctuation.definition.tag'], syntax.tag),
    rule('Attributes', ['entity.other.attribute-name'], syntax.attribute),
    rule('Markdown headings', ['markup.heading', 'entity.name.section'], syntax.keyword, 'bold'),
    rule('Markdown bold', ['markup.bold'], syntax.constant, 'bold'),
    rule('Markdown italic', ['markup.italic'], syntax.type, 'italic'),
    rule('Markdown code', ['markup.inline.raw', 'markup.fenced_code'], syntax.string),
    rule('Links', ['markup.underline.link', 'string.other.link'], syntax.function),
  ];
}

function buildTheme(mode: AtlasMode): object {
  const palette = mode.palette!;
  const light = mode.kind === 'light';
  return {
    $schema: 'vscode://schemas/color-theme',
    name: mode.colorTheme,
    type: light ? 'light' : 'dark',
    semanticHighlighting: true,
    colors: workbenchColors(palette, light),
    tokenColors: tokenColors(palette),
    semanticTokenColors: {
      namespace: palette.syntax.type,
      class: palette.syntax.type,
      interface: palette.syntax.type,
      type: palette.syntax.type,
      typeParameter: palette.syntax.type,
      function: palette.syntax.function,
      method: palette.syntax.function,
      property: palette.syntax.property,
      variable: palette.syntax.variable,
      parameter: { foreground: palette.syntax.variable, italic: true },
      enumMember: palette.syntax.constant,
      'variable.readonly': palette.syntax.constant,
    },
  };
}

mkdirSync('themes', { recursive: true });
const contributions = atlasModeIds
  .map((id) => atlasModes[id])
  .filter((mode) => mode.palette && mode.colorTheme)
  .map((mode) => {
    const path = `./themes/atlas-${mode.id}-color-theme.json`;
    writeFileSync(path, `${JSON.stringify(buildTheme(mode), null, 2)}\n`);
    return { label: mode.colorTheme, uiTheme: mode.kind === 'light' ? 'vs' : 'vs-dark', path };
  });

console.log(`Generated ${contributions.length} themes.`);
console.log(JSON.stringify(contributions, null, 2));
