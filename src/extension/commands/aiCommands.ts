import * as vscode from 'vscode';
import {
  buildEditPlanRequest,
  buildImpactAnalysisRequest,
  buildSummarizeDocsRequest,
  buildTraceFeatureRequest,
  CancelledError,
  describeError,
  relativePosix,
  type AiRequest,
} from '../../core';
import type { AtlasSession } from '../atlasSession';
import { ensureAiReady } from './aiSetup';
import { resolveRoot } from '../host/workspaceRoots';
import { presentResult, resolveTargetFile, uriFromArgument, withCancellableProgress } from '../ui/interaction';

export function registerAiCommands(session: AtlasSession): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('sandboxAtlas.traceFeature', () => traceFeature(session)),
    vscode.commands.registerCommand('sandboxAtlas.summarizeDocs', () => summarizeDocs(session)),
    vscode.commands.registerCommand('sandboxAtlas.analyzeImpact', (argument: unknown) => analyzeImpact(session, uriFromArgument(argument))),
    vscode.commands.registerCommand('sandboxAtlas.generateEditPlan', (argument: unknown) => generateEditPlan(session, uriFromArgument(argument))),
  ];
}

async function traceFeature(session: AtlasSession): Promise<void> {
  const root = await prepareRoot(session);
  if (!root) {
    return;
  }

  const query = await vscode.window.showInputBox({
    prompt: 'What feature do you want to trace?',
    placeHolder: 'e.g. "authentication", "payment processing", "cart state", "API calls"',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length < 2 ? 'Please enter at least 2 characters.' : undefined),
  });
  if (!query?.trim()) {
    return;
  }

  await runAi(session, 'Trace Feature', `Tracing "${query.trim()}"`, (budget) => (
    buildTraceFeatureRequest(session.engine.synthesizer, root, query.trim(), budget)
  ));
}

async function summarizeDocs(session: AtlasSession): Promise<void> {
  const root = await prepareRoot(session);
  if (root) {
    await runAi(session, 'Summarize Docs', 'Summarizing project documentation', (budget) => (
      buildSummarizeDocsRequest(session.engine.synthesizer, root, budget)
    ));
  }
}

async function analyzeImpact(session: AtlasSession, uri: vscode.Uri | undefined): Promise<void> {
  const root = await prepareRoot(session, uri);
  const target = root && await resolveTargetFile(session.engine, root, 'Select a file to analyze impact for', uri);
  if (!root || !target) {
    return;
  }

  await runAi(session, 'Impact Analysis', `Analyzing impact of ${relativePosix(root, target)}`, (budget) => (
    buildImpactAnalysisRequest(session.engine.synthesizer, root, target, budget)
  ));
}

async function generateEditPlan(session: AtlasSession, uri: vscode.Uri | undefined): Promise<void> {
  const root = await prepareRoot(session, uri);
  const target = root && await resolveTargetFile(session.engine, root, 'Select the primary file you want to edit', uri);
  if (!root || !target) {
    return;
  }

  const relativeTarget = relativePosix(root, target);
  const intent = await vscode.window.showInputBox({
    prompt: `What do you want to change in ${relativeTarget}?`,
    placeHolder: 'e.g. "Add input validation to the login form", "Replace useState with useReducer"',
    ignoreFocusOut: true,
    validateInput: (value) => {
      const length = value.trim().length;
      if (length < 5) {
        return 'Please describe the change in at least 5 characters.';
      }
      return length > 500 ? 'Keep the edit intent under 500 characters. Narrow the scope for best results.' : undefined;
    },
  });
  if (!intent?.trim()) {
    return;
  }

  await runAi(session, 'Edit Plan', `Planning edit for ${relativeTarget}`, (budget) => (
    buildEditPlanRequest(session.engine.synthesizer, root, target, intent.trim(), budget)
  ));
}

/** Resolves the root, makes sure it is indexed, and that an AI model can answer — before asking for input. */
async function prepareRoot(session: AtlasSession, uri?: vscode.Uri): Promise<string | undefined> {
  const root = await resolveRoot(uri);
  return root && await session.ensureIndexed(root) && await ensureAiReady(session) ? root : undefined;
}

/** Shared flow: build the request, call the provider under a cancellable progress, render markdown. */
async function runAi(
  session: AtlasSession,
  label: string,
  progressTitle: string,
  buildRequest: (tokenBudget: number) => AiRequest,
): Promise<void> {
  const { engine } = session;
  try {
    const { title, result } = await withCancellableProgress(`Sandbox Atlas: ${progressTitle}…`, async (signal) => {
      const request = buildRequest(engine.aiConfig().contextTokenBudget);
      const run = await engine.runAi(request, signal);
      engine.logger.info(`${label}: ${run.completion.provider}, ${run.completion.totalTokens} tokens (today: ${run.usage.requests} requests).`);
      return { title: request.title, result: run };
    });
    session.refreshViews();
    const subtitle = `${result.completion.provider} · ${result.completion.totalTokens.toLocaleString('en-US')} tokens`;
    await presentResult(session, title, result.markdown, subtitle);
  } catch (error) {
    if (error instanceof CancelledError) {
      return;
    }
    const message = describeError(error);
    engine.logger.error(`${label} failed: ${message}`);
    const action = message.includes('API key') ? 'Set API Key' : 'Show Logs';
    const selection = await vscode.window.showErrorMessage(`Sandbox Atlas (${label}): ${message}`, action);
    if (selection === 'Set API Key') {
      void vscode.commands.executeCommand('sandboxAtlas.setApiKey');
    } else if (selection === 'Show Logs') {
      void vscode.commands.executeCommand('sandboxAtlas.showLogs');
    }
  }
}
