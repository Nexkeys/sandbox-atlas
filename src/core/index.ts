/**
 * Public API of the Sandbox Atlas engine.
 *
 * Everything under `src/core` is host-agnostic: it must never import `vscode` (enforced by
 * ESLint). Hosts — the VS Code extension, the CLI, and a future desktop app — import from here.
 */
export { AtlasEngine, type AtlasEngineOptions } from './atlasEngine';
export * from './model';
export * from './platform';

export * from './ai/aiConfig';
export { CancelledError, type AiCompletionResult, type AiProvider, type AiReadiness } from './ai/aiProvider';
export { UsageLimitError, type DailyUsage } from './ai/usageLimiter';

export * from './features/aiFeatures';
export { buildGraphData } from './features/graphData';
export { buildProjectMap } from './features/projectMap';
export type { AiRunResult } from './features/runAiRequest';

export { DependencyGraph } from './graph/dependencyGraph';
export type { IndexResult, IndexStatus, IndexStatusChange } from './indexing/atlasIndexer';
export { isIndexablePath, type ScanOptions } from './indexing/workspaceScanner';
export { relativePosix } from './util/paths';
