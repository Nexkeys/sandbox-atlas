import type { DocSectionData } from '../model';

interface MarkdownToken {
  type: string;
  raw: string;
}

interface MarkdownHeadingToken extends MarkdownToken {
  type: 'heading';
  depth: number;
  text: string;
}

export interface DocHeuristicFlags {
  hasSetupGuide: boolean;
  hasArchitectureNotes: boolean;
  hasChangelog: boolean;
}

export interface DocParseResult {
  absolutePath: string;
  wordCount: number;
  sections: DocSectionData[];
  flags: DocHeuristicFlags;
  rawContent: string;
  parseError?: string;
}

function createEmptyDocResult(absolutePath: string, content = '', parseError?: string): DocParseResult {
  return {
    absolutePath,
    wordCount: countWords(content),
    sections: [],
    flags: buildHeuristicFlags(absolutePath, content),
    rawContent: content,
    parseError,
  };
}

function stripMarkdownSyntax(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_[\]~\-|]/g, ' ');
}

function countWords(content: string): number {
  const words = stripMarkdownSyntax(content).match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu);
  return words?.length ?? 0;
}

function normalizeHeadingText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lineNumberForOffset(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function extractHeadingSectionsFromTokens(content: string, tokens: MarkdownToken[]): DocSectionData[] {
  let searchOffset = 0;

  return tokens.flatMap((token) => {
    if (token.type !== 'heading') {
      return [];
    }

    const heading = token as MarkdownHeadingToken;
    if (heading.depth < 1 || heading.depth > 3) {
      return [];
    }

    const rawIndex = content.indexOf(heading.raw, searchOffset);
    const lineStart = rawIndex >= 0 ? lineNumberForOffset(content, rawIndex) : 1;
    if (rawIndex >= 0) {
      searchOffset = rawIndex + heading.raw.length;
    }

    return [{
      level: heading.depth as 1 | 2 | 3,
      title: normalizeHeadingText(heading.text),
      lineStart,
    }];
  });
}

function extractHeadingSectionsWithRegex(content: string): DocSectionData[] {
  const sections: DocSectionData[] = [];
  const headingPattern = /^(#{1,3})\s+(.+?)\s*#*\s*$/gm;
  let match: RegExpExecArray | null = headingPattern.exec(content);

  while (match !== null) {
    sections.push({
      level: match[1].length as 1 | 2 | 3,
      title: normalizeHeadingText(match[2]),
      lineStart: lineNumberForOffset(content, match.index),
    });
    match = headingPattern.exec(content);
  }

  return sections;
}

function buildHeuristicFlags(absolutePath: string, content: string): DocHeuristicFlags {
  const normalizedPath = absolutePath.toLowerCase();
  const normalizedContent = content.toLowerCase();

  const hasSetupGuide = /\b(install|installation|setup|getting started|quickstart|configure|configuration|requirements|prerequisites|npm install|yarn add|pnpm add|pip install|cargo install)\b/.test(normalizedContent);
  const hasArchitectureNotes = /\b(architecture|architectural|design notes|system design|data flow|module boundary|component diagram|sequence diagram|adr|decision record|repository map)\b/.test(normalizedContent);
  const hasChangelog = /\b(changelog|change log|release notes|releases|version history|breaking changes|unreleased|semver)\b/.test(normalizedContent)
    || /(^|[\\/])changelog\.md$/i.test(normalizedPath);

  return {
    hasSetupGuide,
    hasArchitectureNotes,
    hasChangelog,
  };
}

export async function docParseFile(absolutePath: string, content: string): Promise<DocParseResult> {
  try {
    const { lexer } = await import('marked');
    const tokens = lexer(content);
    const sections = extractHeadingSectionsFromTokens(content, tokens);

    return {
      absolutePath,
      wordCount: countWords(content),
      sections: sections.length > 0 ? sections : extractHeadingSectionsWithRegex(content),
      flags: buildHeuristicFlags(absolutePath, content),
      rawContent: content,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createEmptyDocResult(absolutePath, content, message);
  }
}
