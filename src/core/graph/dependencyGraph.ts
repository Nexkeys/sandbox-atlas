import * as path from 'path';
import { pathKey } from '../util/paths';

export interface GraphFile {
  absolutePath: string;
  /** Raw import specifiers, e.g. './utils', '../api/client', '@/components/Button', 'react'. */
  dependsOn: string[];
}

/** File-level import graph of a workspace. Only workspace-local imports are resolved. */
export class DependencyGraph {
  private constructor(
    /** File → workspace files it imports. */
    readonly imports: ReadonlyMap<string, readonly string[]>,
    /** File → workspace files that import it. */
    readonly importedBy: ReadonlyMap<string, readonly string[]>,
  ) {}

  static build(workspaceRoot: string, files: GraphFile[]): DependencyGraph {
    const knownFiles = new Map(files.map((file) => [pathKey(file.absolutePath), file.absolutePath]));
    const imports = new Map<string, string[]>();
    const importedBy = new Map<string, string[]>();

    files.forEach((file) => {
      const targets = new Set<string>();
      file.dependsOn.forEach((specifier) => {
        const target = resolveLocalImport(workspaceRoot, file.absolutePath, specifier, knownFiles);
        if (target && target !== file.absolutePath) {
          targets.add(target);
        }
      });

      const sorted = Array.from(targets).sort();
      imports.set(file.absolutePath, sorted);
      sorted.forEach((target) => {
        const importers = importedBy.get(target) ?? [];
        importers.push(file.absolutePath);
        importedBy.set(target, importers);
      });
    });

    importedBy.forEach((importers) => importers.sort());
    return new DependencyGraph(imports, importedBy);
  }

  dependenciesOf(file: string): readonly string[] {
    return this.imports.get(file) ?? [];
  }

  dependentsOf(file: string): readonly string[] {
    return this.importedBy.get(file) ?? [];
  }

  /** Files that import any of `targets`, excluding `exclude`. */
  dependentsOfAll(targets: readonly string[], exclude: ReadonlySet<string>): string[] {
    const result = new Set<string>();
    targets.forEach((target) => {
      this.dependentsOf(target).forEach((importer) => {
        if (!exclude.has(importer)) {
          result.add(importer);
        }
      });
    });
    return Array.from(result).sort();
  }

  /** Most-imported files: changes here have the widest blast radius. */
  hubs(limit: number): Array<{ file: string; dependents: number }> {
    return Array.from(this.importedBy.entries())
      .map(([file, importers]) => ({ file, dependents: importers.length }))
      .sort((left, right) => right.dependents - left.dependents || left.file.localeCompare(right.file))
      .slice(0, limit);
  }

  /**
   * Files nothing imports but which import others: likely entry points (pages, mains, CLIs).
   * Tests are ignored on both sides: they look like entry points, and importing a file from a
   * test doesn't make it any less of one.
   */
  entryPoints(limit: number): string[] {
    return Array.from(this.imports.entries())
      .filter(([file, targets]) => targets.length > 0 && !isTestFile(file) && this.dependentsOf(file).every(isTestFile))
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .slice(0, limit)
      .map(([file]) => file);
  }
}

const testFilePattern = /([\\/](__tests__|tests?|e2e)[\\/])|(\.(test|spec)\.[cm]?[jt]sx?$)/i;

export function isTestFile(filePath: string): boolean {
  return testFilePattern.test(filePath);
}

const resolvableExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
/** Common path aliases in Vite / Next.js / Nuxt projects; both map to `src/` or the root. */
const aliasPrefixes = ['@/', '~/'];

function resolveLocalImport(
  workspaceRoot: string,
  importerPath: string,
  specifier: string,
  knownFiles: ReadonlyMap<string, string>,
): string | undefined {
  const bases: string[] = [];

  if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
    bases.push(path.resolve(path.dirname(importerPath), specifier));
  } else {
    const alias = aliasPrefixes.find((prefix) => specifier.startsWith(prefix));
    if (!alias) {
      return undefined;
    }
    const rest = specifier.slice(alias.length);
    bases.push(path.resolve(workspaceRoot, 'src', rest), path.resolve(workspaceRoot, rest));
  }

  for (const base of bases) {
    for (const candidate of candidatePaths(base)) {
      const match = knownFiles.get(pathKey(candidate));
      if (match) {
        return match;
      }
    }
  }

  return undefined;
}

function candidatePaths(base: string): string[] {
  const candidates = [base];
  const extension = path.extname(base);

  // TypeScript ESM projects import './foo.js' while the source file is './foo.ts'.
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) {
    const withoutExtension = base.slice(0, -extension.length);
    candidates.push(`${withoutExtension}.ts`, `${withoutExtension}.tsx`);
  }

  resolvableExtensions.forEach((ext) => candidates.push(`${base}${ext}`));
  resolvableExtensions.forEach((ext) => candidates.push(path.join(base, `index${ext}`)));
  return candidates;
}
