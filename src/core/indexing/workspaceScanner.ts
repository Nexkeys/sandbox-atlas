import * as fs from 'fs';
import * as path from 'path';
import ignore = require('ignore');
import { isCodeExtension, isDocExtension, type FileRecord } from '../model';

export interface ScanOptions {
  /** Include files matched by .gitignore (heavy directories such as node_modules stay excluded). */
  includeIgnored?: boolean;
}

/** Skipped even when a project has no .gitignore. */
const alwaysSkippedDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  '.vscode-test',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  'coverage',
]);

/** Larger files are almost always generated or vendored and are expensive to parse. */
const maxIndexableFileBytes = 1024 * 1024;

interface IgnoreScope {
  /** Directory the .gitignore lives in, relative to the workspace root ('' for the root). */
  base: string;
  matcher: ignore.Ignore;
}

export function isIndexablePath(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return (isCodeExtension(extension) || isDocExtension(extension)) && !filePath.endsWith('.min.js');
}

/**
 * Lists indexable files under `workspaceRoot`, honouring root and nested .gitignore files.
 * Pure Node — no platform-specific binaries.
 */
export async function scanWorkspace(workspaceRoot: string, options: ScanOptions = {}): Promise<FileRecord[]> {
  const files: FileRecord[] = [];
  await walk(workspaceRoot, '', [], files, options);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function walk(
  directory: string,
  relativeDirectory: string,
  inheritedScopes: IgnoreScope[],
  files: FileRecord[],
  options: ScanOptions,
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  const scopes = [...inheritedScopes];
  if (!options.includeIgnored) {
    const localScope = await readGitignore(directory, relativeDirectory);
    if (localScope) {
      scopes.push(localScope);
    }
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!alwaysSkippedDirectories.has(entry.name) && !isIgnored(scopes, relativePath, true)) {
        await walk(absolutePath, relativePath, scopes, files, options);
      }
      continue;
    }

    if (!entry.isFile() || !isIndexablePath(entry.name) || isIgnored(scopes, relativePath, false)) {
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(absolutePath);
    } catch {
      continue;
    }

    if (stat.size <= maxIndexableFileBytes) {
      files.push({
        absolutePath,
        relativePath,
        extension: path.extname(entry.name).toLowerCase(),
        fileSize: stat.size,
        mtimeMs: Math.floor(stat.mtimeMs),
      });
    }
  }
}

async function readGitignore(directory: string, relativeDirectory: string): Promise<IgnoreScope | undefined> {
  try {
    const content = await fs.promises.readFile(path.join(directory, '.gitignore'), 'utf8');
    return { base: relativeDirectory, matcher: ignore().add(content) };
  } catch {
    return undefined;
  }
}

function isIgnored(scopes: IgnoreScope[], relativePath: string, isDirectory: boolean): boolean {
  return scopes.some((scope) => {
    if (scope.base && !relativePath.startsWith(`${scope.base}/`)) {
      return false;
    }

    const pathFromScope = scope.base ? relativePath.slice(scope.base.length + 1) : relativePath;
    return scope.matcher.ignores(isDirectory ? `${pathFromScope}/` : pathFromScope);
  });
}
