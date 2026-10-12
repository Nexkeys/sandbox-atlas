/**
 * Appearance modes: one source of truth for every visual surface Sandbox Atlas controls —
 * webviews (graph, results), the status bar, and the optional matching VS Code colour themes
 * (generated from these definitions by `scripts/generate-themes.ts`).
 *
 * Pure data, no imports: shared by the extension host, the browser webviews and build scripts.
 */

export type AtlasModeId = 'classic' | 'vibe' | 'hacker' | 'soft' | 'midnight' | 'sunset' | 'blueprint' | 'zen';

export interface SyntaxPalette {
  comment: string;
  keyword: string;
  string: string;
  number: string;
  function: string;
  type: string;
  variable: string;
  property: string;
  constant: string;
  tag: string;
  attribute: string;
  operator: string;
}

export interface ModePalette {
  /** Page background (may be overlaid by `backgroundImage`). */
  background: string;
  backgroundImage?: string;
  /** Cards, toolbars, panels. */
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  /** Text drawn on top of `accent` (buttons). */
  accentText: string;
  edge: string;
  focus: string;
  codeBackground: string;
  /** Categorical node colours for the dependency graph. */
  nodes: string[];
  syntax: SyntaxPalette;
}

export interface AtlasMode {
  id: AtlasModeId;
  label: string;
  /** One line for pickers and settings. */
  description: string;
  /** Codicon shown in the status bar and pickers. */
  icon: string;
  /** 'native' follows the active VS Code theme. */
  kind: 'native' | 'dark' | 'light';
  /** Label of the contributed VS Code colour theme (absent for Classic). */
  colorTheme?: string;
  fonts: {
    ui: string;
    mono: string;
    /** Font for headings in results; defaults to `ui`. */
    display?: string;
  };
  radius: number;
  effects: {
    glow: boolean;
    scanlines: boolean;
    grid: boolean;
  };
  /** Undefined for Classic, which uses VS Code's own colour tokens. */
  palette?: ModePalette;
}

const systemUi = "var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif)";
const systemMono = "var(--vscode-editor-font-family, Consolas, 'Courier New', monospace)";
const codeMono = "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace";

export const atlasModes: Record<AtlasModeId, AtlasMode> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    description: 'Native look — follows your VS Code theme',
    icon: 'map',
    kind: 'native',
    fonts: { ui: systemUi, mono: systemMono },
    radius: 4,
    effects: { glow: false, scanlines: false, grid: false },
  },

  vibe: {
    id: 'vibe',
    label: 'Vibe Coder',
    description: 'Neon gradients, glow and good energy',
    icon: 'sparkle',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Vibe',
    fonts: { ui: "'Inter', 'Segoe UI', system-ui, sans-serif", mono: codeMono, display: "'Poppins', 'Segoe UI', system-ui, sans-serif" },
    radius: 14,
    effects: { glow: true, scanlines: false, grid: false },
    palette: {
      background: '#160d2e',
      backgroundImage: 'radial-gradient(circle at 15% 10%, rgba(255,79,216,0.20), transparent 40%), radial-gradient(circle at 85% 90%, rgba(34,211,238,0.16), transparent 45%)',
      surface: '#22143f',
      surfaceAlt: '#2c1a52',
      border: '#45297a',
      text: '#f6edff',
      muted: '#b9a6d9',
      accent: '#ff4fd8',
      accentText: '#160d2e',
      edge: '#8b6fd6',
      focus: '#22d3ee',
      codeBackground: '#100823',
      nodes: ['#ff4fd8', '#a78bfa', '#22d3ee', '#facc15', '#fb7185', '#34d399', '#60a5fa', '#fb923c', '#e879f9', '#2dd4bf'],
      syntax: {
        comment: '#8a7bb0', keyword: '#ff79c6', string: '#f1fa8c', number: '#ffb86c', function: '#50fa7b',
        type: '#8be9fd', variable: '#f6edff', property: '#c4b5fd', constant: '#bd93f9', tag: '#ff79c6',
        attribute: '#50fa7b', operator: '#ff79c6',
      },
    },
  },

  hacker: {
    id: 'hacker',
    label: 'Hacker',
    description: 'Terminal green on black, monospace, CRT scanlines',
    icon: 'terminal',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Hacker',
    fonts: { ui: codeMono, mono: codeMono },
    radius: 0,
    effects: { glow: true, scanlines: true, grid: false },
    palette: {
      background: '#030803',
      surface: '#081208',
      surfaceAlt: '#0c1a0c',
      border: '#1d4d1d',
      text: '#b6ffb6',
      muted: '#5fbf5f',
      accent: '#39ff14',
      accentText: '#021002',
      edge: '#1f8a1f',
      focus: '#39ff14',
      codeBackground: '#010501',
      nodes: ['#39ff14', '#00ffd5', '#b6ff00', '#ffd400', '#00c3ff', '#7dff9e', '#00ff88', '#e6ff57', '#4dffb8', '#9dff00'],
      syntax: {
        comment: '#3f8f3f', keyword: '#39ff14', string: '#c8ff7a', number: '#ffd400', function: '#00ffd5',
        type: '#7dff9e', variable: '#b6ffb6', property: '#9be89b', constant: '#e6ff57', tag: '#39ff14',
        attribute: '#00ffd5', operator: '#7dff9e',
      },
    },
  },

  soft: {
    id: 'soft',
    label: 'Soft',
    description: 'Calm pastels on cream, rounded and gentle',
    icon: 'heart',
    kind: 'light',
    colorTheme: 'Sandbox Atlas Soft',
    fonts: { ui: "'Nunito', 'Segoe UI', system-ui, sans-serif", mono: codeMono },
    radius: 16,
    effects: { glow: false, scanlines: false, grid: false },
    palette: {
      background: '#fbf7f3',
      surface: '#ffffff',
      surfaceAlt: '#f5eee8',
      border: '#eadfd6',
      text: '#3d3550',
      muted: '#6f6585',
      accent: '#7655e0',
      accentText: '#ffffff',
      edge: '#c9bfd6',
      focus: '#7655e0',
      codeBackground: '#f5eee8',
      nodes: ['#c57286', '#6093c1', '#559a6d', '#b38639', '#927dd3', '#c57c59', '#3e97a1', '#c073ae', '#799748', '#7785d2'],
      syntax: {
        comment: '#8b8198', keyword: '#a1478f', string: '#3b764c', number: '#a6542a', function: '#3b6db3',
        type: '#7a4fc4', variable: '#3d3550', property: '#5a4f7a', constant: '#a6542a', tag: '#a1478f',
        attribute: '#3b6db3', operator: '#6f6585',
      },
    },
  },

  midnight: {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep navy and moonlit blues for late sessions',
    icon: 'star-full',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Midnight',
    fonts: { ui: systemUi, mono: codeMono },
    radius: 8,
    effects: { glow: false, scanlines: false, grid: false },
    palette: {
      background: '#0b1020',
      backgroundImage: 'radial-gradient(circle at 80% 0%, rgba(91,140,255,0.14), transparent 50%)',
      surface: '#111a33',
      surfaceAlt: '#16213f',
      border: '#24335e',
      text: '#dbe4ff',
      muted: '#8fa1cf',
      accent: '#7aa2f7',
      accentText: '#0b1020',
      edge: '#3b4f86',
      focus: '#7dcfff',
      codeBackground: '#080c18',
      nodes: ['#7aa2f7', '#bb9af7', '#7dcfff', '#9ece6a', '#e0af68', '#f7768e', '#73daca', '#ff9e64', '#2ac3de', '#c0caf5'],
      syntax: {
        comment: '#5c6a96', keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', function: '#7aa2f7',
        type: '#2ac3de', variable: '#dbe4ff', property: '#73daca', constant: '#ff9e64', tag: '#f7768e',
        attribute: '#bb9af7', operator: '#89ddff',
      },
    },
  },

  sunset: {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm oranges and rose, golden-hour energy',
    icon: 'flame',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Sunset',
    fonts: { ui: systemUi, mono: codeMono },
    radius: 10,
    effects: { glow: true, scanlines: false, grid: false },
    palette: {
      background: '#1d1117',
      backgroundImage: 'linear-gradient(160deg, rgba(255,122,69,0.16), transparent 40%), linear-gradient(340deg, rgba(232,93,117,0.14), transparent 45%)',
      surface: '#29171f',
      surfaceAlt: '#331d27',
      border: '#4f2a37',
      text: '#ffeae2',
      muted: '#d9a89a',
      accent: '#ff7a45',
      accentText: '#1d1117',
      edge: '#8a4a55',
      focus: '#ffd166',
      codeBackground: '#150c11',
      nodes: ['#ff7a45', '#ff4d6d', '#ffb347', '#ffd166', '#f78fb3', '#c56cf0', '#ff9f80', '#ffcf99', '#e85d75', '#f9a03f'],
      syntax: {
        comment: '#9a7078', keyword: '#ff4d6d', string: '#ffd166', number: '#ff9f80', function: '#ff7a45',
        type: '#f78fb3', variable: '#ffeae2', property: '#ffcf99', constant: '#c56cf0', tag: '#ff4d6d',
        attribute: '#ffb347', operator: '#f78fb3',
      },
    },
  },

  blueprint: {
    id: 'blueprint',
    label: 'Blueprint',
    description: 'Engineering blueprint: white ink on a cyan-blue grid',
    icon: 'circuit-board',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Blueprint',
    fonts: { ui: "'Segoe UI', system-ui, sans-serif", mono: codeMono, display: codeMono },
    radius: 2,
    effects: { glow: false, scanlines: false, grid: true },
    palette: {
      background: '#0c3a63',
      surface: '#0f4574',
      surfaceAlt: '#125084',
      border: '#4b86bd',
      text: '#eef5ff',
      muted: '#b4cfec',
      accent: '#ffe066',
      accentText: '#0c3a63',
      edge: '#cfe3ff',
      focus: '#ffe066',
      codeBackground: '#0a3155',
      nodes: ['#ffffff', '#9fd3ff', '#ffe066', '#c3e8ff', '#7fc8ff', '#e6f2ff', '#ffd166', '#b8e1ff', '#5fb4ff', '#fff3b0'],
      syntax: {
        comment: '#8fb3d9', keyword: '#ffe066', string: '#c3f0c8', number: '#ffd166', function: '#ffffff',
        type: '#9fd3ff', variable: '#eef5ff', property: '#c3e8ff', constant: '#ffd166', tag: '#ffe066',
        attribute: '#9fd3ff', operator: '#c3e8ff',
      },
    },
  },

  zen: {
    id: 'zen',
    label: 'Zen',
    description: 'Ink on paper — minimal, serif, distraction-free',
    icon: 'circle-large-outline',
    kind: 'light',
    colorTheme: 'Sandbox Atlas Zen',
    fonts: { ui: "'Segoe UI', system-ui, sans-serif", mono: codeMono, display: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif" },
    radius: 3,
    effects: { glow: false, scanlines: false, grid: false },
    palette: {
      background: '#f6f3ec',
      surface: '#fffdf8',
      surfaceAlt: '#efebe2',
      border: '#ddd7cb',
      text: '#2a2a2a',
      muted: '#66625a',
      accent: '#b0413e',
      accentText: '#ffffff',
      edge: '#b9b3a7',
      focus: '#b0413e',
      codeBackground: '#efebe2',
      nodes: ['#2a2a2a', '#b0413e', '#3a6ea5', '#5f8a4f', '#8a6d3b', '#5c5c5c', '#7a4f7a', '#3f7f7f', '#8a8a8a', '#a35c2e'],
      syntax: {
        comment: '#868179', keyword: '#2a2a2a', string: '#566e39', number: '#99562a', function: '#2a2a2a',
        type: '#386aa0', variable: '#2a2a2a', property: '#4a4a4a', constant: '#b0413e', tag: '#b0413e',
        attribute: '#386aa0', operator: '#66625a',
      },
    },
  },
};

export const atlasModeIds = Object.keys(atlasModes) as AtlasModeId[];

export function isAtlasModeId(value: unknown): value is AtlasModeId {
  return typeof value === 'string' && value in atlasModes;
}

/** Default categorical palette for Classic (works on light, dark and high-contrast themes). */
export const classicNodeColors = ['#4f8ef7', '#e5a33b', '#3fb68b', '#d96ba8', '#8e7cf0', '#e36b5b', '#3bb3c3', '#a3b33b', '#c77d3b', '#7b8fa6'];

/** What a webview needs to render in a mode. */
export interface AppearanceState {
  mode: AtlasModeId;
  /** Glow, scanlines and animations; off when the user disables effects. */
  effects: boolean;
}
