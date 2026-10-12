import * as vscode from 'vscode';
import { apiKeySecretName, providerLabel, type AiMode, type AiReadiness } from '../../core';
import type { AtlasSession } from '../atlasSession';

const ollamaDownloadUrl = 'https://ollama.com/download';
/** Model names may come from workspace settings, so only plain names ever reach a terminal. */
const safeModelName = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const geminiKeyUrl = 'https://aistudio.google.com/apikey';

/**
 * Makes sure the configured AI provider can answer before an AI command runs. When it can't
 * (no local model, missing key, model not installed…), offers a guided fix and re-checks.
 * Returns true when the command may proceed.
 */
export async function ensureAiReady(session: AtlasSession): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const readiness = await checkReadiness(session);
    if (readiness.ready) {
      return true;
    }
    const fixed = await offerFix(session, readiness);
    if (!fixed) {
      return false;
    }
  }
  return false;
}

export function registerAiSetupCommands(session: AtlasSession): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('sandboxAtlas.setupAi', async () => {
      if (await ensureAiReady(session)) {
        void vscode.window.showInformationMessage(`Sandbox Atlas: ${session.engine.createProvider().displayName} is ready.`);
      }
    }),
  ];
}

/** Stores an API key for `mode`. Returns true when a key was saved. */
export async function promptForApiKey(session: AtlasSession, mode: AiMode): Promise<boolean> {
  const apiKey = await vscode.window.showInputBox({
    title: `${providerLabel(mode)} API key`,
    prompt: 'Stored encrypted in VS Code Secret Storage, never in settings files.',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length < 10 ? 'That looks too short for an API key.' : undefined),
  });
  if (!apiKey?.trim()) {
    return false;
  }
  await session.engine.secrets.store(apiKeySecretName(mode), apiKey.trim());
  session.refreshViews();
  return true;
}

async function checkReadiness(session: AtlasSession): Promise<AiReadiness> {
  const provider = session.engine.createProvider();
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: `Sandbox Atlas: Checking ${provider.displayName}` },
    () => provider.checkReadiness(),
  );
}

/** Shows the fix for `readiness`. Returns true when something changed and it's worth re-checking. */
async function offerFix(session: AtlasSession, readiness: Exclude<AiReadiness, { ready: true }>): Promise<boolean> {
  const config = session.engine.aiConfig();

  switch (readiness.reason) {
    case 'missing-key': {
      const choice = await vscode.window.showWarningMessage(
        readiness.message,
        { modal: true, detail: 'Sandbox Atlas never ships a key — each user brings their own, so nobody pays for anyone else.' },
        'Enter API Key',
        'Use a Local Model Instead',
      );
      if (choice === 'Enter API Key') {
        return promptForApiKey(session, config.mode);
      }
      if (choice === 'Use a Local Model Instead') {
        return switchMode('offline-ollama');
      }
      return false;
    }

    case 'unreachable':
      return config.mode.startsWith('offline') ? offerNoLocalModel(session, readiness.message) : offerRetryOrSwitch(readiness.message);

    case 'model-missing':
      return offerMissingModel(session, readiness);

    case 'rejected': {
      const choice = await vscode.window.showErrorMessage(readiness.message, 'Enter a New Key', 'Choose Another Provider');
      if (choice === 'Enter a New Key') {
        return promptForApiKey(session, config.mode);
      }
      if (choice === 'Choose Another Provider') {
        await vscode.commands.executeCommand('sandboxAtlas.selectAiProvider');
        return true;
      }
      return false;
    }
  }
}

/** The common first-run case: offline mode selected, but no Ollama / LM Studio running. */
async function offerNoLocalModel(session: AtlasSession, message: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    'No AI model found for Sandbox Atlas',
    {
      modal: true,
      detail: `${message}\n\nThe Atlas Map, dependency graph and project map work without AI. For AI answers, pick one:\n`
        + '• Ollama — free, private, runs on your machine (about a 2 GB download).\n'
        + '• Gemini — free tier with a Google account; code context is sent to Google.',
    },
    'Set Up Ollama',
    'Use Gemini (Free Key)',
    'Other Provider…',
  );

  if (choice === 'Set Up Ollama') {
    await setUpOllama(session.engine.aiConfig().model);
    return false; // the user installs Ollama and re-runs the command
  }
  if (choice === 'Use Gemini (Free Key)') {
    await vscode.env.openExternal(vscode.Uri.parse(geminiKeyUrl));
    if (await promptForApiKey(session, 'online-gemini')) {
      return switchMode('online-gemini');
    }
    return false;
  }
  if (choice === 'Other Provider…') {
    await vscode.commands.executeCommand('sandboxAtlas.selectAiProvider');
    return true;
  }
  return false;
}

async function offerMissingModel(session: AtlasSession, readiness: Exclude<AiReadiness, { ready: true }>): Promise<boolean> {
  const { mode, model } = session.engine.aiConfig();
  const installed = readiness.availableModels ?? [];
  const actions = [
    ...(mode === 'offline-ollama' ? [`Download ${model}`] : []),
    ...(installed.length > 0 ? ['Use an Installed Model'] : []),
  ];
  const choice = await vscode.window.showWarningMessage(readiness.message, ...actions);

  if (choice === `Download ${model}`) {
    pullInTerminal(model);
    void vscode.window.showInformationMessage(
      `Sandbox Atlas: downloading ${model} in the terminal. Run your command again when it finishes.`,
    );
    return false;
  }
  if (choice === 'Use an Installed Model') {
    const picked = await vscode.window.showQuickPick(installed, { placeHolder: 'Which installed model should Sandbox Atlas use?' });
    if (picked) {
      await vscode.workspace.getConfiguration('sandboxAtlas.ai').update('offlineModel', picked, vscode.ConfigurationTarget.Global);
      return true;
    }
  }
  return false;
}

async function offerRetryOrSwitch(message: string): Promise<boolean> {
  const choice = await vscode.window.showErrorMessage(message, 'Try Again', 'Choose Another Provider');
  if (choice === 'Choose Another Provider') {
    await vscode.commands.executeCommand('sandboxAtlas.selectAiProvider');
  }
  return choice !== undefined;
}

async function setUpOllama(model: string): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(ollamaDownloadUrl));
  if (!safeModelName.test(model)) {
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    `After installing Ollama, download the model with: ollama pull ${model}`,
    'Run It in a Terminal',
    'Copy Command',
  );
  if (choice === 'Run It in a Terminal') {
    pullInTerminal(model);
  } else if (choice === 'Copy Command') {
    await vscode.env.clipboard.writeText(`ollama pull ${model}`);
  }
}

function pullInTerminal(model: string): void {
  if (!safeModelName.test(model)) {
    void vscode.window.showErrorMessage(`Sandbox Atlas: "${model}" is not a valid model name, so it won't be run in a terminal.`);
    return;
  }
  const terminal = vscode.window.createTerminal('Sandbox Atlas: Ollama');
  terminal.show();
  terminal.sendText(`ollama pull ${model}`, true);
}

async function switchMode(mode: AiMode): Promise<boolean> {
  await vscode.workspace.getConfiguration('sandboxAtlas.ai').update('mode', mode, vscode.ConfigurationTarget.Global);
  return true;
}
