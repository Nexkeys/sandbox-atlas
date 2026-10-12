import type { CodeFileRecord, DocRecord, FileRecord } from '../model';
import { DependencyGraph } from '../graph/dependencyGraph';
import type { AtlasStore } from '../storage/atlasStore';
import { estimateTokens } from '../util/tokens';

export interface ContextBlockSummary {
  title: string;
  source: string;
  estimatedTokens: number;
  priority: number;
}

export interface SynthesizedContext {
  prompt: string;
  tokenBudget: number;
  estimatedTokens: number;
  includedBlocks: ContextBlockSummary[];
}

export interface FileSynthesizedContext extends SynthesizedContext {
  /** False when the target file is not in the index (never scanned, or excluded by .gitignore). */
  targetFound: boolean;
  /** Workspace files the target imports. */
  dependencies: string[];
  /** Files that import the target directly. */
  directDependents: string[];
  /** Files that import a direct dependent (second-level cascade). */
  indirectDependents: string[];
}

interface ContextBlock {
  title: string;
  source: string;
  content: string;
  priority: number;
}

interface WorkspaceSnapshot {
  files: FileRecord[];
  code: CodeFileRecord[];
  docs: DocRecord[];
}

/**
 * Turns the cached index into a token-budgeted prompt. Blocks are ranked by relevance to the
 * request and the lowest-priority blocks are dropped until the prompt fits the budget.
 */
export class ContextSynthesizer {
  constructor(private readonly store: AtlasStore) {}

  /** Context ranked by keyword relevance to `userQuery` across the whole workspace. */
  synthesizeWorkspaceContext(workspaceRoot: string, userQuery: string, tokenBudget: number): SynthesizedContext {
    const snapshot = this.loadSnapshot(workspaceRoot);
    const blocks = buildRankedBlocks(workspaceRoot, userQuery, snapshot);
    return finalizeContext(userQuery, blocks, tokenBudget);
  }

  /**
   * Context centred on one file: the file itself, a resolved dependency summary, its direct
   * and second-level dependents, and its local imports, followed by query-ranked context.
   */
  synthesizeFileContext(
    workspaceRoot: string,
    absoluteFilePath: string,
    userQuery: string,
    tokenBudget: number,
  ): FileSynthesizedContext {
    const snapshot = this.loadSnapshot(workspaceRoot);
    const target = snapshot.files.find((file) => file.absolutePath === absoluteFilePath);
    if (!target) {
      return {
        ...finalizeContext(userQuery, [], tokenBudget),
        targetFound: false,
        dependencies: [],
        directDependents: [],
        indirectDependents: [],
      };
    }

    const relativeByPath = new Map(snapshot.files.map((file) => [file.absolutePath, file.relativePath]));
    const toRelative = (absolutePath: string) => relativeByPath.get(absolutePath) ?? absolutePath;
    const codeByPath = new Map(snapshot.code.map((file) => [file.absolutePath, file]));

    const graph = DependencyGraph.build(workspaceRoot, snapshot.code);
    const dependencies = [...graph.dependenciesOf(absoluteFilePath)];
    const directDependents = graph.dependentsOfAll([absoluteFilePath], new Set([absoluteFilePath]));
    const indirectDependents = graph.dependentsOfAll(directDependents, new Set([absoluteFilePath, ...directDependents]));

    const blocks: ContextBlock[] = [];
    const targetCode = codeByPath.get(absoluteFilePath);
    blocks.push({
      title: `Target File: ${target.relativePath}`,
      source: absoluteFilePath,
      priority: 1000,
      content: targetCode ? renderCodeFile(targetCode) : `Path: ${target.relativePath}\n(not a parsed code file)`,
    });

    const listOrNone = (paths: string[]) => paths.map((item) => `- ${toRelative(item)}`).join('\n') || '- none';
    blocks.push({
      title: 'Resolved Dependency Map',
      source: absoluteFilePath,
      priority: 900,
      content: [
        `Target: ${target.relativePath}`,
        `Direct dependents (files that import the target): ${directDependents.length}`,
        listOrNone(directDependents),
        `Indirect dependents (files that import a direct dependent): ${indirectDependents.length}`,
        listOrNone(indirectDependents),
        `Local imports of the target: ${dependencies.length}`,
        listOrNone(dependencies),
      ].join('\n'),
    });

    const addCodeBlocks = (paths: string[], title: string, priority: number) => {
      paths.forEach((filePath, index) => {
        const code = codeByPath.get(filePath);
        if (code) {
          blocks.push({
            title: `${title}: ${code.relativePath}`,
            source: filePath,
            priority: priority - Math.min(index, 50),
            content: renderCodeFile(code),
          });
        }
      });
    };
    addCodeBlocks(directDependents, 'Direct Dependent', 700);
    addCodeBlocks(dependencies, 'Imported By Target', 600);
    addCodeBlocks(indirectDependents, 'Indirect Dependent', 500);

    const focusedSources = new Set(blocks.map((block) => block.source));
    const rankedBlocks = buildRankedBlocks(workspaceRoot, `${target.relativePath} ${userQuery}`, snapshot)
      .filter((block) => !focusedSources.has(block.source));

    return {
      ...finalizeContext(userQuery, [...blocks, ...rankedBlocks], tokenBudget),
      targetFound: true,
      dependencies,
      directDependents,
      indirectDependents,
    };
  }

  private loadSnapshot(workspaceRoot: string): WorkspaceSnapshot {
    return {
      files: this.store.listFiles(workspaceRoot),
      code: this.store.listCodeFiles(workspaceRoot),
      docs: this.store.listDocs(workspaceRoot),
    };
  }
}

function buildRankedBlocks(workspaceRoot: string, userQuery: string, snapshot: WorkspaceSnapshot): ContextBlock[] {
  const keywords = extractKeywords(userQuery);
  const parsedPaths = new Set([...snapshot.code, ...snapshot.docs].map((file) => file.absolutePath));
  const blocks: ContextBlock[] = [{
    title: 'Workspace Inventory',
    source: workspaceRoot,
    priority: 100,
    content: renderWorkspaceInventory(snapshot),
  }];

  rankBy(snapshot.code, (file) => scoreCodeFile(file, keywords)).slice(0, 30).forEach((file) => {
    blocks.push({
      title: `Code Structure: ${file.relativePath}`,
      source: file.absolutePath,
      priority: 80 + scoreCodeFile(file, keywords),
      content: renderCodeFile(file),
    });
  });

  rankBy(snapshot.docs, (doc) => scoreDoc(doc, keywords, userQuery)).slice(0, 12).forEach((doc) => {
    blocks.push({
      title: `Documentation: ${doc.relativePath}`,
      source: doc.absolutePath,
      priority: 55 + scoreDoc(doc, keywords, userQuery),
      content: renderDoc(doc),
    });
  });

  snapshot.files.forEach((file) => {
    const pathScore = scoreText(file.relativePath, keywords);
    if (parsedPaths.has(file.absolutePath) || pathScore === 0) {
      return;
    }

    blocks.push({
      title: `Mapped File: ${file.relativePath}`,
      source: file.absolutePath,
      priority: 25 + pathScore,
      content: `Path: ${file.relativePath}\nSize: ${file.fileSize} bytes`,
    });
  });

  return blocks;
}

function finalizeContext(userQuery: string, blocks: ContextBlock[], tokenBudget: number): SynthesizedContext {
  const selectedBlocks = selectBlocksWithinBudget(userQuery, blocks, tokenBudget);
  const prompt = buildPrompt(userQuery, selectedBlocks);

  return {
    prompt,
    tokenBudget,
    estimatedTokens: estimateTokens(prompt.length),
    includedBlocks: selectedBlocks.map((block) => ({
      title: block.title,
      source: block.source,
      estimatedTokens: estimateTokens(block.content.length),
      priority: block.priority,
    })),
  };
}

// ── Relevance scoring ─────────────────────────────────────────────────────────

const stopWords = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'can', 'could', 'for', 'from', 'how', 'into',
  'the', 'this', 'that', 'what', 'when', 'where', 'which', 'with', 'would', 'your',
]);

function extractKeywords(query: string): string[] {
  const matches = query.toLowerCase().match(/[a-z0-9_./-]{3,}/g) ?? [];
  return Array.from(new Set(matches.filter((word) => !stopWords.has(word))));
}

function scoreText(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  return keywords.reduce((score, keyword) => (lowerText.includes(keyword) ? score + 4 : score), 0);
}

function scoreCodeFile(file: CodeFileRecord, keywords: string[]): number {
  const searchable = [
    file.relativePath,
    ...file.components.map((component) => component.name),
    ...file.functions.map((fn) => fn.name),
    ...file.exports.map((exportData) => exportData.name),
    ...file.imports.map((importData) => importData.moduleSpecifier),
  ].join(' ');

  // Keyword matches dominate; structure only breaks ties between equally relevant files.
  const directScore = scoreText(searchable, keywords) * 5;
  const structureScore = Math.min(file.components.length + file.functions.length, 6);
  return directScore + structureScore + (file.hasDefaultExport ? 1 : 0);
}

function scoreDoc(doc: DocRecord, keywords: string[], userQuery: string): number {
  const sectionText = doc.sections.map((section) => section.title).join(' ');
  let score = scoreText(`${doc.relativePath} ${sectionText} ${doc.rawContent.slice(0, 1000)}`, keywords);
  const lowerQuery = userQuery.toLowerCase();

  if (doc.hasSetupGuide && /\b(setup|install|configure|run|start)\b/.test(lowerQuery)) {
    score += 12;
  }
  if (doc.hasArchitectureNotes && /\b(architecture|design|map|flow|structure)\b/.test(lowerQuery)) {
    score += 12;
  }
  if (doc.hasChangelog && /\b(change|release|version|history)\b/.test(lowerQuery)) {
    score += 8;
  }
  return score;
}

function rankBy<T extends { parsedAt: number }>(items: T[], score: (item: T) => number): T[] {
  return [...items].sort((left, right) => score(right) - score(left) || right.parsedAt - left.parsedAt);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderWorkspaceInventory(snapshot: WorkspaceSnapshot): string {
  const extensionCounts = new Map<string, number>();
  snapshot.files.forEach((file) => {
    const extension = file.extension || '(none)';
    extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
  });

  const extensionLines = Array.from(extensionCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([extension, count]) => `- ${extension}: ${count}`)
    .join('\n');

  return [
    `Mapped files: ${snapshot.files.length}`,
    `Parsed code files: ${snapshot.code.length}`,
    `Parsed documentation files: ${snapshot.docs.length}`,
    'Extension distribution:',
    extensionLines || '- none',
  ].join('\n');
}

function renderCodeFile(file: CodeFileRecord): string {
  const imports = file.imports.map((importData) => {
    const named = importData.namedImports.map((item) => (item.alias ? `${item.name} as ${item.alias}` : item.name));
    const bindings = [
      importData.defaultImport,
      importData.namespaceImport ? `* as ${importData.namespaceImport}` : undefined,
      named.length > 0 ? `{ ${named.join(', ')} }` : undefined,
    ].filter((value): value is string => typeof value === 'string');

    return `- ${bindings.join(', ') || '(side-effect)'} from "${importData.moduleSpecifier}"${importData.isTypeOnly ? ' type-only' : ''}`;
  });

  const exports = file.exports.map((exportData) => {
    const alias = exportData.alias ? ` as ${exportData.alias}` : '';
    const source = exportData.moduleSpecifier ? ` from "${exportData.moduleSpecifier}"` : '';
    return `- ${exportData.type}: ${exportData.name}${alias}${source}${exportData.isTypeOnly ? ' type-only' : ''}`;
  });

  const components = file.components.map((component) => (
    `- ${component.name} (${component.declarationKind}, lines ${component.lineStart}-${component.lineEnd}, hooks: ${component.usesHooks}, jsx: ${component.returnsJsx})`
  ));

  const functions = file.functions.map((fn) => {
    const params = fn.parameters.map((param) => `${param.name}${param.isOptional ? '?' : ''}${param.type ? `: ${param.type}` : ''}`).join(', ');
    return `- ${fn.isAsync ? 'async ' : ''}${fn.name}(${params})${fn.returnType ? `: ${fn.returnType}` : ''} (${fn.declarationKind}, exported: ${fn.isExported}, lines ${fn.lineStart}-${fn.lineEnd})`;
  });

  return [
    `Path: ${file.relativePath}`,
    `Lines of code: ${file.linesOfCode}`,
    `Default export: ${file.hasDefaultExport}`,
    'Imports:',
    imports.join('\n') || '- none',
    'Exports:',
    exports.join('\n') || '- none',
    'Components:',
    components.join('\n') || '- none',
    'Functions:',
    functions.join('\n') || '- none',
  ].join('\n');
}

function renderDoc(doc: DocRecord): string {
  const sections = doc.sections.map((section) => `${'#'.repeat(section.level)} ${section.title} (line ${section.lineStart})`);
  const excerpt = doc.rawContent.replace(/\s+/g, ' ').trim().slice(0, 1400);

  return [
    `Path: ${doc.relativePath}`,
    `Word count: ${doc.wordCount}`,
    `Setup guide: ${doc.hasSetupGuide}`,
    `Architecture notes: ${doc.hasArchitectureNotes}`,
    `Changelog: ${doc.hasChangelog}`,
    'Sections:',
    sections.join('\n') || '- none',
    'Cached excerpt:',
    excerpt || '(empty)',
  ].join('\n');
}

// ── Token budgeting ───────────────────────────────────────────────────────────

function selectBlocksWithinBudget(userQuery: string, blocks: ContextBlock[], tokenBudget: number): ContextBlock[] {
  const availableBudget = Math.max(0, tokenBudget - estimateTokens(buildPrompt(userQuery, []).length));
  const sortedBlocks = [...blocks].sort((left, right) => (
    right.priority - left.priority || left.content.length - right.content.length
  ));
  const selected: ContextBlock[] = [];
  let usedTokens = 0;

  sortedBlocks.forEach((block) => {
    const remainingTokens = availableBudget - usedTokens;
    if (remainingTokens <= 0) {
      return;
    }

    const blockTokens = estimateTokens(block.content.length);
    if (blockTokens <= remainingTokens) {
      selected.push(block);
      usedTokens += blockTokens;
    } else if (remainingTokens >= 80 && block.priority >= 60) {
      const trimmedContent = trimToTokenBudget(block.content, remainingTokens);
      selected.push({ ...block, content: trimmedContent });
      usedTokens += estimateTokens(trimmedContent.length);
    }
  });

  return enforceFinalPromptBudget(userQuery, selected, tokenBudget);
}

function trimToTokenBudget(content: string, tokenBudget: number): string {
  const maxChars = Math.max(0, tokenBudget * 4);
  if (content.length <= maxChars) {
    return content;
  }

  const suffix = '\n[Context trimmed to fit the active token budget.]';
  return `${content.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

function buildPrompt(userQuery: string, blocks: ContextBlock[]): string {
  const renderedBlocks = blocks
    .map((block) => [`## ${block.title}`, `Source: ${block.source}`, block.content].join('\n'))
    .join('\n\n');

  return [
    '# Sandbox Atlas Repository Context',
    'Use only the cached repository facts below. The context is synthesized from the local index and may omit files that have not been indexed yet.',
    '',
    '## User Request',
    userQuery,
    '',
    renderedBlocks || 'No cached repository context is available for this workspace yet.',
  ].join('\n');
}

function enforceFinalPromptBudget(userQuery: string, blocks: ContextBlock[], tokenBudget: number): ContextBlock[] {
  const selected = [...blocks];

  while (selected.length > 0 && estimateTokens(buildPrompt(userQuery, selected).length) > tokenBudget) {
    const lowestIndex = selected.reduce((lowest, block, index) => (block.priority < selected[lowest].priority ? index : lowest), 0);
    selected.splice(lowestIndex, 1);
  }

  return selected;
}
