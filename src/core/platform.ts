/**
 * Ports: the only things a host (VS Code extension, CLI, future desktop app) must provide
 * to run the Sandbox Atlas engine. The engine never imports a host API directly.
 */

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

/** Encrypted credential storage (VS Code SecretStorage, OS keychain, env vars...). */
export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Small persistent key/value state (VS Code globalState, a JSON file...). */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Promise<void>;
}

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error ?? 'Unknown error');
}
