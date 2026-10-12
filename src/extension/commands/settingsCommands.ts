import * as vscode from 'vscode';
import {
  aiModes,
  apiKeySecretName,
  isOnlineMode,
  providerLabel,
  type AiMode,
} from '../../core';
import type { AtlasSession } from '../atlasSession';
import { ensureAiReady } from './aiSetup';

const modeDetails: Record<AiMode, string> = {
  'offline-ollama': 'Local · free · private — requires Ollama running',
  'offline-lmstudio': 'Local · free · private — requires LM Studio server',
  'online-gemini': 'Cloud · API key required',
  'online-openai': 'Cloud · API key required',
  'online-openrouter': 'Cloud · API key required · many models',
};

export function registerSettingsCommands(session: AtlasSession): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('sandboxAtlas.selectAiProvider', () => selectAiProvider(session)),
    vscode.commands.registerCommand('sandboxAtlas.setApiKey', (mode?: AiMode) => setApiKey(session, mode)),
    vscode.commands.registerCommand('sandboxAtlas.testConnection', () => testConnection(session)),
  ];
}

async function selectAiProvider(session: AtlasSession): Promise<void> {
  const current = session.engine.aiConfig().mode;
  const picked = await vscode.window.showQuickPick(
    aiModes.map((mode) => ({
      label: `${mode === current ? '$(check) ' : ''}${providerLabel(mode)}`,
      description: modeDetails[mode],
      mode,
    })),
    { placeHolder: 'Choose the AI provider for Sandbox Atlas' },
  );
  if (!picked) {
    return;
  }

  await vscode.workspace.getConfiguration('sandboxAtlas.ai').update('mode', picked.mode, vscode.ConfigurationTarget.Global);
  if (isOnlineMode(picked.mode) && !await session.engine.secrets.get(apiKeySecretName(picked.mode))) {
    await setApiKey(session, picked.mode);
  }
}

async function setApiKey(session: AtlasSession, preselected?: AiMode): Promise<void> {
  let mode = preselected;
  if (!mode) {
    const current = session.engine.aiConfig().mode;
    const onlineModes = aiModes.filter(isOnlineMode);
    const ordered = [...onlineModes.filter((item) => item === current), ...onlineModes.filter((item) => item !== current)];
    mode = (await vscode.window.showQuickPick(
      ordered.map((item) => ({ label: providerLabel(item), mode: item })),
      { placeHolder: 'Which provider is this API key for?' },
    ))?.mode;
  }
  if (!mode) {
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    prompt: `${providerLabel(mode)} API key — stored encrypted in VS Code Secret Storage. Leave empty to remove it.`,
    password: true,
    ignoreFocusOut: true,
  });
  if (apiKey === undefined) {
    return;
  }

  const secretName = apiKeySecretName(mode);
  if (apiKey.trim()) {
    await session.engine.secrets.store(secretName, apiKey.trim());
  } else {
    await session.engine.secrets.delete(secretName);
  }
  session.refreshViews();
  void vscode.window.showInformationMessage(`Sandbox Atlas: ${providerLabel(mode)} API key ${apiKey.trim() ? 'saved' : 'removed'}.`);
}

async function testConnection(session: AtlasSession): Promise<void> {
  if (await ensureAiReady(session)) {
    void vscode.window.showInformationMessage(`Sandbox Atlas: ${session.engine.createProvider().displayName} is ready.`);
  }
}
