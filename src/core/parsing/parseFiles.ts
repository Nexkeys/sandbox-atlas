import * as fs from 'fs';
import * as path from 'path';
import { isCodeExtension, isDocExtension, type FileRecord } from '../model';
import type { Logger } from '../platform';
import type { AtlasStore, ParseResultEntry } from '../storage/atlasStore';
import type * as AstParserModule from './astParser';
import type * as DocParserModule from './docParser';

export interface ParseSummary {
  codeFilesParsed: number;
  docFilesParsed: number;
  failedFiles: number;
}

const chunkSize = 50;
/** Max continuous CPU time before yielding, so the host (e.g. the VS Code extension host) stays responsive. */
const sliceBudgetMs = 30;

/**
 * Parses files and stores the results, one transaction per chunk. AST parsing is synchronous
 * CPU work, so it yields to the event loop every ~30 ms to keep the host responsive.
 */
export async function parseFiles(
  store: AtlasStore,
  workspaceRoot: string,
  files: Array<Pick<FileRecord, 'absolutePath' | 'relativePath'>>,
  logger: Logger,
): Promise<ParseSummary> {
  const summary: ParseSummary = { codeFilesParsed: 0, docFilesParsed: 0, failedFiles: 0 };
  // Loaded on first use: ts-morph bundles the TypeScript compiler, which is slow to initialise.
  const { astParseFile } = require('./astParser') as typeof AstParserModule;
  const { docParseFile } = require('./docParser') as typeof DocParserModule;
  let sliceStart = Date.now();

  for (let index = 0; index < files.length; index += chunkSize) {
    const entries: ParseResultEntry[] = [];

    for (const file of files.slice(index, index + chunkSize)) {
      const extension = path.extname(file.absolutePath).toLowerCase();
      if (!isCodeExtension(extension) && !isDocExtension(extension)) {
        continue;
      }

      let content: string;
      try {
        content = await fs.promises.readFile(file.absolutePath, 'utf8');
      } catch (error) {
        summary.failedFiles += 1;
        logger.warn(`Could not read ${file.absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      if (isCodeExtension(extension)) {
        const ast = astParseFile(file.absolutePath, content);
        if (ast.parseError) {
          logger.warn(`Parse error in ${file.relativePath}: ${ast.parseError}`);
        }
        entries.push({ kind: 'code', record: { ...ast, relativePath: file.relativePath } });
        summary.codeFilesParsed += 1;
      } else {
        const doc = await docParseFile(file.absolutePath, content);
        entries.push({
          kind: 'doc',
          record: {
            absolutePath: file.absolutePath,
            relativePath: file.relativePath,
            sections: doc.sections,
            wordCount: doc.wordCount,
            hasSetupGuide: doc.flags.hasSetupGuide,
            hasArchitectureNotes: doc.flags.hasArchitectureNotes,
            hasChangelog: doc.flags.hasChangelog,
            rawContent: doc.rawContent,
          },
        });
        summary.docFilesParsed += 1;
      }

      if (Date.now() - sliceStart > sliceBudgetMs) {
        await yieldToEventLoop();
        sliceStart = Date.now();
      }
    }

    store.saveParseResults(workspaceRoot, entries);
  }

  return summary;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
