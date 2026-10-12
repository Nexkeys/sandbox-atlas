import * as vscode from 'vscode';
import type { AiSettings, KeyValueStore, Logger, SecretStore } from '../../core';

/** Binds the engine's platform ports to VS Code APIs. */

export function createLogger(channel: vscode.LogOutputChannel): Logger {
  return {
    info: (message) => channel.info(message),
    warn: (message) => channel.warn(message),
    error: (message, error) => channel.error(message, ...(error instanceof Error ? [error] : [])),
  };
}

export function createSecretStore(secrets: vscode.SecretStorage): SecretStore {
  return {
    get: async (key) => secrets.get(key),
    store: async (key, value) => secrets.store(key, value),
    delete: async (key) => secrets.delete(key),
  };
}

export function createStateStore(memento: vscode.Memento): KeyValueStore {
  return {
    get: <T>(key: string) => memento.get<T>(key),
    update: async (key, value) => memento.update(key, value),
  };
}

export function readAiSettings(): AiSettings {
  const config = vscode.workspace.getConfiguration('sandboxAtlas.ai');
  return {
    mode: config.get<string>('mode'),
    offlineModel: config.get<string>('offlineModel'),
    onlineModel: config.get<string>('onlineModel'),
    baseUrl: config.get<string>('baseUrl'),
    requestTimeoutSeconds: config.get<number>('requestTimeoutSeconds'),
    dailyRequestLimit: config.get<number>('dailyRequestLimit'),
  };
}

export function isAutoRefreshEnabled(): boolean {
  return vscode.workspace.getConfiguration('sandboxAtlas.index').get<boolean>('autoRefresh', true);
}
