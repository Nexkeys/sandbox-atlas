import { type ContextSynthesizer } from '../context/contextSynthesizer';
import {
  DOC_SUMMARY_SYSTEM_PROMPT,
  EDIT_PLAN_SYSTEM_PROMPT,
  FEATURE_TRACE_SYSTEM_PROMPT,
  IMPACT_ANALYSIS_SYSTEM_PROMPT,
} from '../ai/prompts';
import { relativePosix } from '../util/paths';

/** A fully prepared AI request: prompt, context, and how to present the answer. */
export interface AiRequest {
  title: string;
  systemPrompt: string;
  userContent: string;
  /** Markdown lines appended under the answer. */
  footerLines: string[];
  maxTokens: number;
  temperature: number;
}

/** A request that cannot run because of the user's input or index state (message is user-facing). */
export class FeatureInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeatureInputError';
  }
}

const notIndexedHint = '(files ignored by .gitignore, over 1 MB, or outside the workspace are not indexed).';

export function buildTraceFeatureRequest(
  synthesizer: ContextSynthesizer,
  workspaceRoot: string,
  query: string,
  tokenBudget: number,
): AiRequest {
  const context = synthesizer.synthesizeWorkspaceContext(workspaceRoot, query, tokenBudget);
  const filesAnalyzed = context.includedBlocks.filter((block) => (
    block.title.startsWith('Code Structure:') || block.title.startsWith('Mapped File:')
  )).length;
  if (filesAnalyzed === 0) {
    throw new FeatureInputError('No indexed code files found. Run "Sandbox Atlas: Scan Workspace" first.');
  }

  return {
    title: `Feature Trace: "${query}"`,
    systemPrompt: FEATURE_TRACE_SYSTEM_PROMPT,
    userContent: `Feature query: "${query}"\n\n---\n\n${context.prompt}`,
    footerLines: [`**Query:** ${query}  `, `**Files analyzed:** ${filesAnalyzed}  `],
    maxTokens: 1024,
    temperature: 0.2,
  };
}

export function buildSummarizeDocsRequest(
  synthesizer: ContextSynthesizer,
  workspaceRoot: string,
  tokenBudget: number,
): AiRequest {
  const context = synthesizer.synthesizeWorkspaceContext(
    workspaceRoot,
    'project documentation readme setup install architecture overview entry points',
    tokenBudget,
  );
  const docsIncluded = context.includedBlocks.filter((block) => block.title.startsWith('Documentation:')).length;
  if (docsIncluded === 0) {
    throw new FeatureInputError(
      'No documentation files found. Add a README.md or /docs directory, then run "Sandbox Atlas: Scan Workspace".',
    );
  }

  return {
    title: 'Project Documentation Summary',
    systemPrompt: DOC_SUMMARY_SYSTEM_PROMPT,
    userContent: `Summarize the documentation for this project.\n\n---\n\n${context.prompt}`,
    footerLines: [`**Documentation files analyzed:** ${docsIncluded}  `],
    maxTokens: 1500,
    temperature: 0.1,
  };
}

export function buildImpactAnalysisRequest(
  synthesizer: ContextSynthesizer,
  workspaceRoot: string,
  targetFile: string,
  tokenBudget: number,
): AiRequest {
  const relativeTarget = relativePosix(workspaceRoot, targetFile);
  const context = synthesizer.synthesizeFileContext(workspaceRoot, targetFile, `What breaks if ${relativeTarget} changes?`, tokenBudget);
  if (!context.targetFound) {
    throw new FeatureInputError(`"${relativeTarget}" has not been indexed. Run "Sandbox Atlas: Scan Workspace" ${notIndexedHint}`);
  }

  return {
    title: `Impact Analysis: ${relativeTarget}`,
    systemPrompt: IMPACT_ANALYSIS_SYSTEM_PROMPT,
    userContent: `Analyze the impact of modifying this file: \`${relativeTarget}\`\n\n---\n\n${context.prompt}`,
    footerLines: [
      `**Target file:** \`${relativeTarget}\`  `,
      `**Direct dependents:** ${context.directDependents.length} · **Indirect dependents:** ${context.indirectDependents.length}  `,
    ],
    maxTokens: 1200,
    temperature: 0.15,
  };
}

export function buildEditPlanRequest(
  synthesizer: ContextSynthesizer,
  workspaceRoot: string,
  targetFile: string,
  intent: string,
  tokenBudget: number,
): AiRequest {
  const relativeTarget = relativePosix(workspaceRoot, targetFile);
  const context = synthesizer.synthesizeFileContext(workspaceRoot, targetFile, intent, tokenBudget);
  if (!context.targetFound) {
    throw new FeatureInputError(`"${relativeTarget}" has not been indexed. Run "Sandbox Atlas: Scan Workspace" ${notIndexedHint}`);
  }

  return {
    title: `Edit Plan: ${relativeTarget}`,
    systemPrompt: EDIT_PLAN_SYSTEM_PROMPT,
    userContent: `Primary file to edit: \`${relativeTarget}\`\nEdit intent: "${intent}"\n\n---\n\n${context.prompt}`,
    footerLines: [
      `**Primary file:** \`${relativeTarget}\`  `,
      `**Edit intent:** ${intent}  `,
      `**Files that import it:** ${context.directDependents.length}  `,
      '*This is a plan, not code. Review it, then execute each step (or paste it into your AI editor).*  ',
    ],
    maxTokens: 1400,
    temperature: 0.2,
  };
}
