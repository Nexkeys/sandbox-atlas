/**
 * Appearance modes: one source of truth for every visual surface Sandbox Atlas controls —
 * webviews (graph, results), the status bar, and the optional matching VS Code colour themes
 * (generated from these definitions by `scripts/generate-themes.ts`).
 *
 * Pure data, no imports: shared by the extension host, the browser webviews and build scripts.
 */

export type AtlasModeId =
  | 'classic' | 'vibe' | 'hacker' | 'soft' | 'midnight' | 'sunset' | 'blueprint' | 'zen'
  | 'retro' | 'synthwave' | 'solar' | 'groove' | 'arctic' | 'cyberpunk' | 'arcade';

/** Corner and border language of panels and buttons. */
export type ModeShape = 'rounded' | 'pill' | 'sharp' | 'angular' | 'pixel';

export type IconSetId = 'classic' | 'terminal' | 'minimal' | 'playful' | 'technical' | 'geometric' | 'pixel';

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
  shape: ModeShape;
  /** Headings and buttons in upper case (terminal-style modes). */
  headingCase: 'normal' | 'upper';
  /** Multiplier for the base font size (pixel fonts need a larger size to stay legible). */
  fontScale: number;
  /** Codicons used in the sidebar, status bar and graph. */
  iconSet: IconSetId;
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
// Bundled fonts (see src/webview/common/fonts.css) come first; system fonts are fallbacks.
const sans = (family: string) => `'${family}', 'Segoe UI', system-ui, sans-serif`;
const mono = (family: string) => `'${family}', 'Cascadia Code', Consolas, monospace`;
const codeMono = mono('JetBrains Mono');

export const atlasModes: Record<AtlasModeId, AtlasMode> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    description: 'Native look — follows your VS Code theme',
    icon: 'map',
    kind: 'native',
    fonts: { ui: systemUi, mono: systemMono },
    radius: 4,
    shape: 'rounded',
    headingCase: 'normal',
    fontScale: 1,
    iconSet: 'classic',
    effects: { glow: false, scanlines: false, grid: false },
  },

  vibe: {
    id: 'vibe',
    label: 'Vibe Coder',
    description: 'Neon gradients, glow and good energy',
    icon: 'sparkle',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Vibe',
    fonts: { ui: sans('Inter'), mono: codeMono, display: sans('Poppins') },
    radius: 14,
    shape: 'pill',
    headingCase: 'normal',
    fontScale: 1,
    iconSet: 'playful',
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
    shape: 'sharp',
    headingCase: 'upper',
    fontScale: 1,
    iconSet: 'terminal',
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
    fonts: { ui: sans('Nunito'), mono: codeMono },
    radius: 16,
    shape: 'rounded',
    headingCase: 'normal',
    fontScale: 1,
    iconSet: 'minimal',
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
    fonts: { ui: sans('Inter'), mono: codeMono },
    radius: 8,
    shape: 'rounded',
    headingCase: 'normal',
    fontScale: 1,
    iconSet: 'classic',
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
    fonts: { ui: sans('Space Grotesk'), mono: codeMono, display: sans('Poppins') },
    radius: 10,
    shape: 'rounded',
    headingCase: 'normal',
    fontScale: 1,
    iconSet: 'playful',
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
    fonts: { ui: sans('IBM Plex Sans'), mono: mono('IBM Plex Mono'), display: mono('IBM Plex Mono') },
    radius: 2,
    shape: 'sharp',
    headingCase: 'upper',
    fontScale: 1,
    iconSet: 'technical',
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
    fonts: { ui: sans('Inter'), mono: codeMono, display: "'Source Serif 4', 'Iowan Old Style', Georgia, serif" },
    radius: 3,
    shape: 'sharp',
    headingCase: 'normal',
    fontScale: 1,
    iconSet: 'minimal',
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

  retro: {
    id: 'retro',
    label: 'Retro Terminal',
    description: 'Amber CRT monitor: VT323 pixel type, scanlines and phosphor glow',
    icon: 'terminal-bash',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Retro Terminal',
    fonts: { ui: mono('VT323'), mono: mono('VT323'), display: mono('VT323') },
    radius: 0,
    shape: 'sharp',
    headingCase: 'upper',
    fontScale: 1.3,
    iconSet: 'terminal',
    effects: { glow: true, scanlines: true, grid: false },
    palette: {
      background: '#0d0800',
      surface: '#160e02',
      surfaceAlt: '#1e1404',
      border: '#5a3c0a',
      text: '#ffb000',
      muted: '#d39a2a',
      accent: '#ffb000',
      accentText: '#120a00',
      edge: '#9a6a14',
      focus: '#ffd166',
      codeBackground: '#090500',
      nodes: ['#ffb000', '#ffd166', '#ff8c00', '#ffe8a3', '#e6a100', '#ffc861', '#ff9f1a', '#fff0c2', '#d99100', '#ffbe3d'],
      syntax: {
        comment: '#a8792a', keyword: '#ffd166', string: '#ffe8a3', number: '#ff9f1a', function: '#ffb000',
        type: '#ffc861', variable: '#ffb000', property: '#e6a100', constant: '#ff9f1a', tag: '#ffd166',
        attribute: '#ffe8a3', operator: '#e6a100',
      },
    },
  },

  synthwave: {
    id: 'synthwave',
    label: 'Synthwave',
    description: "'80s neon: hot pink and cyan glow over a purple night",
    icon: 'rocket',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Synthwave',
    fonts: { ui: sans('Space Grotesk'), mono: codeMono, display: sans('Orbitron') },
    radius: 6,
    shape: 'rounded',
    headingCase: 'upper',
    fontScale: 1,
    iconSet: 'playful',
    effects: { glow: true, scanlines: false, grid: true },
    palette: {
      background: '#241b2f',
      backgroundImage: 'linear-gradient(to bottom, rgba(255,126,219,0) 55%, rgba(255,126,219,0.16)), radial-gradient(circle at 50% 110%, rgba(54,249,246,0.18), transparent 50%)',
      surface: '#2a2139',
      surfaceAlt: '#34294f',
      border: '#5b4f8c',
      text: '#f4eefa',
      muted: '#c2b9d4',
      accent: '#ff7edb',
      accentText: '#241b2f',
      edge: '#36f9f6',
      focus: '#36f9f6',
      codeBackground: '#1e1726',
      nodes: ['#ff7edb', '#36f9f6', '#fede5d', '#72f1b8', '#fe6a74', '#f97e72', '#c9a3e0', '#03edf9', '#ff8b39', '#ffffff'],
      syntax: {
        comment: '#9096c9', keyword: '#fede5d', string: '#ff8b39', number: '#f97e72', function: '#36f9f6',
        type: '#fe6a74', variable: '#ff7edb', property: '#ff7edb', constant: '#f97e72', tag: '#72f1b8',
        attribute: '#fede5d', operator: '#fede5d',
      },
    },
  },

  solar: {
    id: 'solar',
    label: 'Solar',
    description: 'Solarized-inspired teal and gold, IBM Plex type',
    icon: 'symbol-color',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Solar',
    fonts: { ui: sans('IBM Plex Sans'), mono: mono('IBM Plex Mono') },
    radius: 4,
    shape: 'rounded',
    headingCase: 'normal',
    fontScale: 1,
    iconSet: 'technical',
    effects: { glow: false, scanlines: false, grid: false },
    palette: {
      background: '#002b36',
      surface: '#073642',
      surfaceAlt: '#0b4252',
      border: '#2a5a66',
      text: '#c5d1d1',
      muted: '#a2b2b4',
      accent: '#b58900',
      accentText: '#001e26',
      edge: '#6c8a91',
      focus: '#2aa1e8',
      codeBackground: '#00212b',
      nodes: ['#b58900', '#cb4b16', '#e0504a', '#d33682', '#8b8fd8', '#268bd2', '#2aa198', '#859900', '#93a1a1', '#c0cfcf'],
      syntax: {
        comment: '#6f868d', keyword: '#99b000', string: '#2aa198', number: '#e05a9a', function: '#3b9be0',
        type: '#c99a10', variable: '#a7b5b5', property: '#a7b5b5', constant: '#e0663a', tag: '#3b9be0',
        attribute: '#c99a10', operator: '#99b000',
      },
    },
  },

  groove: {
    id: 'groove',
    label: 'Groove',
    description: 'Gruvbox-inspired warm retro colours, Fira type with ligatures',
    icon: 'flame',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Groove',
    fonts: { ui: sans('Fira Sans'), mono: mono('Fira Code') },
    radius: 6,
    shape: 'rounded',
    headingCase: 'normal',
    fontScale: 1,
    iconSet: 'geometric',
    effects: { glow: false, scanlines: false, grid: false },
    palette: {
      background: '#282828',
      surface: '#32302f',
      surfaceAlt: '#3c3836',
      border: '#5a514b',
      text: '#ebdbb2',
      muted: '#c9b99b',
      accent: '#fabd2f',
      accentText: '#282828',
      edge: '#8a7b6f',
      focus: '#83a598',
      codeBackground: '#1d2021',
      nodes: ['#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#fe8019', '#ebdbb2', '#689d6a', '#e0773c'],
      syntax: {
        comment: '#928374', keyword: '#fb4934', string: '#b8bb26', number: '#d3869b', function: '#fabd2f',
        type: '#8ec07c', variable: '#ebdbb2', property: '#83a598', constant: '#d3869b', tag: '#fb4934',
        attribute: '#fabd2f', operator: '#fe8019',
      },
    },
  },

  arctic: {
    id: 'arctic',
    label: 'Arctic',
    description: 'Nord-inspired cool frost blues, clean Inter type',
    icon: 'globe',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Arctic',
    fonts: { ui: sans('Inter'), mono: codeMono },
    radius: 8,
    shape: 'rounded',
    headingCase: 'normal',
    fontScale: 1,
    iconSet: 'minimal',
    effects: { glow: false, scanlines: false, grid: false },
    palette: {
      background: '#2e3440',
      surface: '#3b4252',
      surfaceAlt: '#434c5e',
      border: '#56607a',
      text: '#eceff4',
      muted: '#d8dee9',
      accent: '#88c0d0',
      accentText: '#2e3440',
      edge: '#81a1c1',
      focus: '#88c0d0',
      codeBackground: '#272c36',
      nodes: ['#88c0d0', '#81a1c1', '#7aa0d4', '#e07f88', '#d08770', '#ebcb8b', '#a3be8c', '#c9a6c3', '#8fbcbb', '#eceff4'],
      syntax: {
        comment: '#8390a8', keyword: '#81a1c1', string: '#a3be8c', number: '#c9a6c3', function: '#88c0d0',
        type: '#8fbcbb', variable: '#d8dee9', property: '#d8dee9', constant: '#c9a6c3', tag: '#81a1c1',
        attribute: '#8fbcbb', operator: '#81a1c1',
      },
    },
  },

  cyberpunk: {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'Night-city yellow and cyan, cut-corner panels, Orbitron headings',
    icon: 'circuit-board',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Cyberpunk',
    fonts: { ui: sans('Space Grotesk'), mono: mono('Space Mono'), display: sans('Orbitron') },
    radius: 0,
    shape: 'angular',
    headingCase: 'upper',
    fontScale: 1,
    iconSet: 'technical',
    effects: { glow: true, scanlines: false, grid: false },
    palette: {
      background: '#0a0a12',
      backgroundImage: 'linear-gradient(115deg, rgba(252,238,10,0.07) 0 30%, transparent 30%), radial-gradient(circle at 90% 10%, rgba(0,240,255,0.14), transparent 40%)',
      surface: '#12121f',
      surfaceAlt: '#1a1a2e',
      border: '#3a3a5c',
      text: '#e6f7ff',
      muted: '#9fb6cc',
      accent: '#fcee0a',
      accentText: '#0a0a12',
      edge: '#00b8c4',
      focus: '#00f0ff',
      codeBackground: '#06060c',
      nodes: ['#fcee0a', '#00f0ff', '#ff2a55', '#c77dff', '#00ff9f', '#ff8a00', '#5c88ff', '#ff4fd8', '#c4ff00', '#ffffff'],
      syntax: {
        comment: '#6f84a0', keyword: '#ff2a55', string: '#00ff9f', number: '#fcee0a', function: '#00f0ff',
        type: '#c77dff', variable: '#e6f7ff', property: '#8fd8ff', constant: '#ff8a00', tag: '#ff4fd8',
        attribute: '#fcee0a', operator: '#ff2a55',
      },
    },
  },

  arcade: {
    id: 'arcade',
    label: 'Arcade',
    description: '8-bit console palette, pixel borders and Press Start 2P headings',
    icon: 'smiley',
    kind: 'dark',
    colorTheme: 'Sandbox Atlas Arcade',
    fonts: { ui: mono('Space Mono'), mono: mono('Space Mono'), display: "'Press Start 2P', 'Space Mono', monospace" },
    radius: 0,
    shape: 'pixel',
    headingCase: 'upper',
    fontScale: 1,
    iconSet: 'pixel',
    effects: { glow: false, scanlines: false, grid: false },
    palette: {
      background: '#1d1b3a',
      surface: '#272552',
      surfaceAlt: '#312e63',
      border: '#6a66b8',
      text: '#ffffff',
      muted: '#c8c6ee',
      accent: '#ffa300',
      accentText: '#1d1b3a',
      edge: '#8f8bd6',
      focus: '#ffec27',
      codeBackground: '#15132b',
      nodes: ['#ff4d6d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#a99bd0', '#ff77a8', '#ffccaa', '#c2c3c7', '#d07a4a'],
      syntax: {
        comment: '#8f8bc4', keyword: '#ff77a8', string: '#00e436', number: '#ffa300', function: '#29adff',
        type: '#ffec27', variable: '#ffffff', property: '#c2c3c7', constant: '#ff6b85', tag: '#ff77a8',
        attribute: '#ffccaa', operator: '#ffec27',
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

// ── Icon sets ────────────────────────────────────────────────────────────────

/** Codicon names (https://microsoft.github.io/vscode-codicons/) for each UI slot. */
export interface IconSet {
  label: string;
  component: string;
  function: string;
  method: string;
  heading: string;
  section: string;
  index: string;
  code: string;
  docs: string;
  aiLocal: string;
  aiCloud: string;
  mode: string;
  usage: string;
  actions: string;
  chat: string;
  /** Cytoscape node shapes in the dependency graph. */
  graph: { component: string; module: string };
}

export const iconSets: Record<IconSetId, IconSet> = {
  classic: {
    label: 'Classic', component: 'symbol-class', function: 'symbol-function', method: 'symbol-method', heading: 'symbol-namespace',
    section: 'symbol-key', index: 'pass-filled', code: 'file-code', docs: 'book', aiLocal: 'vm', aiCloud: 'cloud', mode: 'paintcan',
    usage: 'graph-line', actions: 'zap', chat: 'comment-discussion', graph: { component: 'round-rectangle', module: 'ellipse' },
  },
  terminal: {
    label: 'Terminal', component: 'terminal', function: 'chevron-right', method: 'dash', heading: 'symbol-string',
    section: 'debug-stackframe-dot', index: 'check', code: 'code', docs: 'output', aiLocal: 'server', aiCloud: 'cloud', mode: 'terminal-bash',
    usage: 'pulse', actions: 'run-all', chat: 'terminal', graph: { component: 'rectangle', module: 'rectangle' },
  },
  minimal: {
    label: 'Minimal', component: 'circle-filled', function: 'circle-small-filled', method: 'circle-small', heading: 'dash',
    section: 'dash', index: 'check', code: 'circle-outline', docs: 'circle-outline', aiLocal: 'circle-large-outline', aiCloud: 'circle-large-outline',
    mode: 'circle-large-outline', usage: 'dash', actions: 'arrow-right', chat: 'comment', graph: { component: 'ellipse', module: 'ellipse' },
  },
  playful: {
    label: 'Playful', component: 'sparkle', function: 'zap', method: 'star-empty', heading: 'bookmark',
    section: 'star-empty', index: 'heart', code: 'rocket', docs: 'book', aiLocal: 'hubot', aiCloud: 'cloud', mode: 'sparkle',
    usage: 'flame', actions: 'rocket', chat: 'sparkle', graph: { component: 'star', module: 'ellipse' },
  },
  technical: {
    label: 'Technical', component: 'symbol-structure', function: 'symbol-operator', method: 'symbol-event', heading: 'symbol-ruler',
    section: 'symbol-field', index: 'verified', code: 'circuit-board', docs: 'note', aiLocal: 'chip', aiCloud: 'cloud', mode: 'settings-gear',
    usage: 'dashboard', actions: 'tools', chat: 'debug-console', graph: { component: 'hexagon', module: 'round-rectangle' },
  },
  geometric: {
    label: 'Geometric', component: 'symbol-interface', function: 'triangle-right', method: 'triangle-right', heading: 'primitive-square',
    section: 'primitive-dot', index: 'pass', code: 'layers', docs: 'symbol-file', aiLocal: 'vm', aiCloud: 'cloud', mode: 'color-mode',
    usage: 'graph-line', actions: 'layers-active', chat: 'comment-discussion', graph: { component: 'diamond', module: 'round-hexagon' },
  },
  pixel: {
    label: 'Pixel', component: 'primitive-square', function: 'play', method: 'debug-breakpoint-data-unverified', heading: 'star-full',
    section: 'star-empty', index: 'heart', code: 'symbol-misc', docs: 'book', aiLocal: 'smiley', aiCloud: 'cloud', mode: 'smiley',
    usage: 'flame', actions: 'play-circle', chat: 'comment', graph: { component: 'rectangle', module: 'octagon' },
  },
};

export const iconSetIds = Object.keys(iconSets) as IconSetId[];

// ── Fonts ───────────────────────────────────────────────────────────────────

/** Fonts bundled with the extension (OFL) and selectable as overrides. */
export const uiFontChoices = ['Inter', 'Poppins', 'Nunito', 'Space Grotesk', 'IBM Plex Sans', 'Fira Sans', 'Source Serif 4', 'Orbitron', 'VT323', 'Press Start 2P'] as const;
export const codeFontChoices = ['JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Space Mono', 'VT323'] as const;

/** Raw appearance settings, as stored by the host. */
export interface AppearanceState {
  mode: AtlasModeId;
  /** Glow, scanlines and animations; off when the user disables effects. */
  effects: boolean;
  /** 'mode' = the mode's font, 'editor' = VS Code's font, or a bundled font name. */
  uiFont?: string;
  codeFont?: string;
  /** 'mode' or an icon set id. */
  iconSet?: string;
}

/** Fonts and icons after applying the user's overrides to the mode's defaults. */
export interface ResolvedAppearance {
  mode: AtlasMode;
  fonts: { ui: string; mono: string; display: string };
  fontScale: number;
  icons: IconSet;
}

const pixelFonts = new Set(['VT323']);

export function resolveAppearance(state: AppearanceState): ResolvedAppearance {
  const mode = atlasModes[state.mode] ?? atlasModes.classic;
  const fontFor = (choice: string | undefined, choices: readonly string[], modeFont: string, editorFont: string, fallback: (f: string) => string) => {
    if (choice === 'editor') {
      return editorFont;
    }
    return choice && choices.includes(choice) ? fallback(choice) : modeFont;
  };
  const ui = fontFor(state.uiFont, uiFontChoices, mode.fonts.ui, systemUi, sans);
  const monoFont = fontFor(state.codeFont, codeFontChoices, mode.fonts.mono, systemMono, mono);
  const uiOverridden = Boolean(state.uiFont && state.uiFont !== 'mode');
  const iconSet = state.iconSet && state.iconSet in iconSets ? state.iconSet as IconSetId : mode.iconSet;

  return {
    mode,
    fonts: { ui, mono: monoFont, display: uiOverridden ? ui : mode.fonts.display ?? ui },
    fontScale: uiOverridden ? (pixelFonts.has(state.uiFont!) ? 1.3 : 1) : mode.fontScale,
    icons: iconSets[iconSet],
  };
}
