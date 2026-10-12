import { atlasModes, classicNodeColors, type AppearanceState, type AtlasMode } from '../../shared/appearance';

/** Classic mode maps every Atlas token onto VS Code's own theme variables. */
const classicTokens: Record<string, string> = {
  '--atlas-bg': 'var(--vscode-editor-background)',
  '--atlas-bg-image': 'none',
  '--atlas-surface': 'var(--vscode-editorWidget-background, var(--vscode-editor-background))',
  '--atlas-surface-alt': 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
  '--atlas-border': 'var(--vscode-editorWidget-border, var(--vscode-panel-border, rgba(128,128,128,0.35)))',
  '--atlas-text': 'var(--vscode-editor-foreground)',
  '--atlas-muted': 'var(--vscode-descriptionForeground)',
  '--atlas-accent': 'var(--vscode-button-background)',
  '--atlas-accent-text': 'var(--vscode-button-foreground)',
  '--atlas-edge': 'var(--vscode-descriptionForeground)',
  '--atlas-focus': 'var(--vscode-focusBorder)',
  '--atlas-code-bg': 'var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12))',
};

/**
 * Applies a mode to the document: CSS tokens on <body>, plus data attributes that switch effects
 * (glow, scanlines, grid). High-contrast themes always get Classic for accessibility.
 * Returns the mode actually applied.
 */
export function applyAppearance(state: AppearanceState): AtlasMode {
  const highContrast = document.body.classList.contains('vscode-high-contrast')
    || document.body.classList.contains('vscode-high-contrast-light');
  const mode = highContrast ? atlasModes.classic : atlasModes[state.mode] ?? atlasModes.classic;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const effects = state.effects && !reducedMotion;

  const tokens: Record<string, string> = mode.palette
    ? {
      '--atlas-bg': mode.palette.background,
      '--atlas-bg-image': mode.palette.backgroundImage ?? 'none',
      '--atlas-surface': mode.palette.surface,
      '--atlas-surface-alt': mode.palette.surfaceAlt,
      '--atlas-border': mode.palette.border,
      '--atlas-text': mode.palette.text,
      '--atlas-muted': mode.palette.muted,
      '--atlas-accent': mode.palette.accent,
      '--atlas-accent-text': mode.palette.accentText,
      '--atlas-edge': mode.palette.edge,
      '--atlas-focus': mode.palette.focus,
      '--atlas-code-bg': mode.palette.codeBackground,
    }
    : classicTokens;

  // Set on <body> so var(--vscode-*) references resolve whether VS Code defines its variables on
  // <html> (inherited) or on <body>.
  const root = document.body.style;
  Object.entries(tokens).forEach(([name, value]) => root.setProperty(name, value));
  root.setProperty('--atlas-font-ui', mode.fonts.ui);
  root.setProperty('--atlas-font-mono', mode.fonts.mono);
  root.setProperty('--atlas-font-display', mode.fonts.display ?? mode.fonts.ui);
  root.setProperty('--atlas-radius', `${mode.radius}px`);

  const data = document.body.dataset;
  data.mode = mode.id;
  data.kind = mode.kind;
  toggle('glow', effects && mode.effects.glow);
  toggle('scanlines', effects && mode.effects.scanlines);
  toggle('grid', mode.effects.grid);
  return mode;
}

/** Categorical node colours for the dependency graph in `mode`. */
export function nodeColors(mode: AtlasMode): string[] {
  return mode.palette?.nodes ?? classicNodeColors;
}

/** Resolved value of a CSS custom property (var() references are substituted by the browser). */
export function token(name: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

function toggle(flag: string, on: boolean): void {
  if (on) {
    document.body.dataset[flag] = '';
  } else {
    delete document.body.dataset[flag];
  }
}
