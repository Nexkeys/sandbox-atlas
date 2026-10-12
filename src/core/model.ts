/**
 * Domain model shared by every layer of Sandbox Atlas.
 * Plain data only — no behaviour, no platform dependencies.
 */

export type DeclarationKind = 'function' | 'arrow' | 'function-expression';

export interface NamedImportData {
  name: string;
  alias?: string;
}

export interface ImportData {
  moduleSpecifier: string;
  defaultImport?: string;
  namespaceImport?: string;
  namedImports: NamedImportData[];
  isTypeOnly: boolean;
}

export interface ExportData {
  name: string;
  alias?: string;
  type: 'named' | 'default' | 'namespace';
  moduleSpecifier?: string;
  isTypeOnly: boolean;
}

export interface FunctionParameterData {
  name: string;
  type?: string;
  isOptional: boolean;
}

export interface FunctionData {
  name: string;
  parameters: FunctionParameterData[];
  isAsync: boolean;
  isExported: boolean;
  returnType?: string;
  lineStart: number;
  lineEnd: number;
  declarationKind: DeclarationKind;
}

export interface ComponentData {
  name: string;
  declarationKind: DeclarationKind;
  usesHooks: boolean;
  returnsJsx: boolean;
  lineStart: number;
  lineEnd: number;
}

export interface DocSectionData {
  level: 1 | 2 | 3;
  title: string;
  lineStart: number;
}

/** A file discovered by the scanner. */
export interface FileRecord {
  absolutePath: string;
  /** Always forward-slash separated, relative to the workspace root. */
  relativePath: string;
  extension: string;
  fileSize: number;
  mtimeMs: number;
}

/** Structural facts extracted from a TS/JS file. */
export interface CodeFileRecord {
  absolutePath: string;
  relativePath: string;
  imports: ImportData[];
  exports: ExportData[];
  components: ComponentData[];
  functions: FunctionData[];
  /** Raw import specifiers, e.g. './utils', '@/api/client', 'react'. */
  dependsOn: string[];
  hasDefaultExport: boolean;
  linesOfCode: number;
  parsedAt: number;
}

/** Structural facts extracted from a Markdown file. */
export interface DocRecord {
  absolutePath: string;
  relativePath: string;
  sections: DocSectionData[];
  wordCount: number;
  hasSetupGuide: boolean;
  hasArchitectureNotes: boolean;
  hasChangelog: boolean;
  rawContent: string;
  parsedAt: number;
}

export interface WorkspaceStats {
  files: number;
  codeFiles: number;
  docFiles: number;
  lastScanAt?: number;
  lastScanDurationMs?: number;
}

const codeExtensions: ReadonlySet<string> = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const docExtensions: ReadonlySet<string> = new Set(['.md', '.markdown', '.mdx']);

export function isCodeExtension(extension: string): boolean {
  return codeExtensions.has(extension);
}

export function isDocExtension(extension: string): boolean {
  return docExtensions.has(extension);
}

// ── Dependency graph (serializable; shared with the graph webview) ───────────

export interface GraphNode {
  id: string;
  label: string;
  relativePath: string;
  /** Top-level folder, used for colouring. */
  group: string;
  kind: 'component' | 'module';
  dependents: number;
  dependencies: number;
  linesOfCode: number;
  isFocus: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  workspaceName: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalFiles: number;
  truncated: boolean;
  focus?: string;
}

export interface GraphOptions {
  /** Absolute path to centre the graph on; shows its neighbourhood only. */
  focus?: string;
  /** Hops from the focus file in both directions. */
  depth?: number;
  maxNodes?: number;
}
