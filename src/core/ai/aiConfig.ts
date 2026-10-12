export type AiMode = 'offline-ollama' | 'offline-lmstudio' | 'online-gemini' | 'online-openrouter' | 'online-openai';

export const aiModes: readonly AiMode[] = ['offline-ollama', 'offline-lmstudio', 'online-gemini', 'online-openrouter', 'online-openai'];

/** User-facing settings as read by a host (VS Code settings, CLI flags/env, a config file...). */
export interface AiSettings {
  mode?: string;
  offlineModel?: string;
  onlineModel?: string;
  baseUrl?: string;
  /** 0 or unset = automatic (local models on a CPU can need minutes). */
  requestTimeoutSeconds?: number;
  /** Max AI requests per day for online providers. 0 disables the limit. */
  dailyRequestLimit?: number;
}

/** Fully resolved configuration used by the engine. */
export interface AiConfig {
  mode: AiMode;
  baseUrl: string;
  model: string;
  requestTimeoutMs: number;
  dailyRequestLimit: number;
  /** Approximate prompt size the context synthesizer may use. */
  contextTokenBudget: number;
}

interface ModeDefaults {
  label: string;
  baseUrl: string;
  model: string;
}

const modeDefaults: Record<AiMode, ModeDefaults> = {
  'offline-ollama': { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5-coder:3b' },
  'offline-lmstudio': { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5-coder:3b' },
  'online-gemini': { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  'online-openrouter': { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'mistralai/mistral-7b-instruct' },
  'online-openai': { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
};

export function isAiMode(value: unknown): value is AiMode {
  return typeof value === 'string' && value in modeDefaults;
}

export function isOnlineMode(mode: AiMode): boolean {
  return mode.startsWith('online');
}

export function providerLabel(mode: AiMode): string {
  return modeDefaults[mode].label;
}

export function resolveAiConfig(settings: AiSettings): AiConfig {
  const mode = isAiMode(settings.mode) ? settings.mode : 'offline-ollama';
  const defaults = modeDefaults[mode];
  const modelOverride = isOnlineMode(mode) ? settings.onlineModel : settings.offlineModel;

  return {
    mode,
    baseUrl: settings.baseUrl?.trim() || defaults.baseUrl,
    model: modelOverride?.trim() || defaults.model,
    requestTimeoutMs: resolveTimeoutSeconds(settings.requestTimeoutSeconds, mode) * 1000,
    dailyRequestLimit: Math.max(0, Math.floor(settings.dailyRequestLimit ?? 100)),
    // Local servers default to a 4096-token window (Ollama), which must hold the system prompt
    // (~400), this context and the answer (≤1500). Hosted models have far larger windows.
    contextTokenBudget: isOnlineMode(mode) ? 8000 : 2400,
  };
}

function resolveTimeoutSeconds(configured: number | undefined, mode: AiMode): number {
  if (configured && configured > 0) {
    return Math.max(10, configured);
  }
  return isOnlineMode(mode) ? 120 : 300;
}

/** Secret-store key under which a provider's API key is kept. */
export function apiKeySecretName(mode: AiMode): string {
  return `sandboxAtlas.apiKey.${mode}`;
}

export function missingApiKeyMessage(mode: AiMode): string {
  return `No API key set for ${providerLabel(mode)}. In VS Code run "Sandbox Atlas: Set AI API Key" (CLI: set ATLAS_API_KEY), or switch to an offline mode (Ollama / LM Studio).`;
}
