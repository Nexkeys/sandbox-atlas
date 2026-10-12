import type { SecretStore } from '../platform';
import { estimateTokens } from '../util/tokens';
import { apiKeySecretName, isOnlineMode, missingApiKeyMessage, providerLabel, type AiConfig, type AiMode } from './aiConfig';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  /** Aborts the request, e.g. when the user cancels. */
  signal?: AbortSignal;
}

export interface AiCompletionResult {
  content: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Why the configured provider cannot answer yet, so hosts can offer the right fix. */
export type AiReadiness =
  | { ready: true }
  | {
    ready: false;
    /**
     * - `missing-key`: online provider without an API key
     * - `unreachable`: server not running / no network
     * - `model-missing`: local server is up but the model isn't installed
     * - `rejected`: the provider refused the request (bad key, quota…)
     */
    reason: 'missing-key' | 'unreachable' | 'model-missing' | 'rejected';
    message: string;
    /** Models the local server does have (for `model-missing`). */
    availableModels?: string[];
  };

export interface AiProvider {
  readonly mode: AiMode;
  /** e.g. "Ollama (qwen2.5-coder:3b)". */
  readonly displayName: string;
  /** Fast check (≤5 s) that the provider can answer: key present, server reachable, model installed. */
  checkReadiness(): Promise<AiReadiness>;
  completeChat(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult>;
}

/** Thrown when the user cancels a request; callers should exit silently. */
export class CancelledError extends Error {
  constructor() {
    super('Request cancelled.');
    this.name = 'CancelledError';
  }
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null }; text?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}

interface ErrorResponseBody {
  error?: { message?: string };
  message?: string;
}

/**
 * Client for any OpenAI-compatible chat completions endpoint (Ollama, LM Studio, OpenAI,
 * Gemini, OpenRouter). Errors are thrown, never displayed, so the host decides how to surface them.
 */
class OpenAiCompatibleProvider implements AiProvider {
  readonly mode: AiMode;
  readonly displayName: string;
  private readonly label: string;

  constructor(
    private readonly config: AiConfig,
    private readonly secrets: SecretStore,
  ) {
    this.mode = config.mode;
    this.label = providerLabel(config.mode);
    this.displayName = `${this.label} (${config.model})`;
  }

  async checkReadiness(): Promise<AiReadiness> {
    let headers: Record<string, string>;
    try {
      headers = await this.headers();
    } catch (error) {
      return { ready: false, reason: 'missing-key', message: describe(error) };
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint('/models'), { headers, signal: AbortSignal.timeout(5000) });
    } catch {
      const where = isOnlineMode(this.config.mode) ? `${this.label} (${this.config.baseUrl})` : `${this.label} at ${this.config.baseUrl}`;
      return { ready: false, reason: 'unreachable', message: `Could not reach ${where}. ${this.troubleshootingHint()}` };
    }

    if (!response.ok) {
      const detail = response.status === 401 || response.status === 403 ? 'The API key was rejected.' : await readErrorBody(response);
      return { ready: false, reason: 'rejected', message: `${this.label} returned HTTP ${response.status}. ${detail}` };
    }

    // Local servers list installed models; hosted catalogues use different ids, so only check locally.
    if (!isOnlineMode(this.config.mode)) {
      const models = await readModelIds(response);
      if (models && !modelIsInstalled(this.config.model, models)) {
        return {
          ready: false,
          reason: 'model-missing',
          message: `${this.label} is running, but the model "${this.config.model}" isn't installed.`,
          availableModels: models,
        };
      }
    }

    return { ready: true };
  }

  async completeChat(messages: AiChatMessage[], options: AiCompletionOptions = {}): Promise<AiCompletionResult> {
    const signals = [AbortSignal.timeout(this.config.requestTimeoutMs)];
    if (options.signal) {
      signals.push(options.signal);
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint('/chat/completions'), {
        method: 'POST',
        headers: await this.headers(),
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens,
        }),
        signal: AbortSignal.any(signals),
      });
    } catch (error) {
      throw this.toError(error, options.signal);
    }

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new Error(`${this.label} returned HTTP ${response.status} ${response.statusText}. ${body} ${this.troubleshootingHint()}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    const firstChoice = data.choices?.[0];
    const content = firstChoice?.message?.content ?? firstChoice?.text;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error(`${this.label} returned an empty response. Check that model "${this.config.model}" supports chat completions.`);
    }

    const promptChars = messages.reduce((total, message) => total + message.content.length, 0);
    const promptTokens = data.usage?.prompt_tokens ?? estimateTokens(promptChars);
    const completionTokens = data.usage?.completion_tokens ?? estimateTokens(content.length);

    return {
      content,
      model: data.model ?? this.config.model,
      provider: this.displayName,
      promptTokens,
      completionTokens,
      totalTokens: data.usage?.total_tokens ?? promptTokens + completionTokens,
    };
  }

  private endpoint(route: '/models' | '/chat/completions'): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}${route}`;
  }

  private async headers(): Promise<Record<string, string>> {
    // Local servers ignore the key, but the OpenAI-compatible protocol expects one.
    let apiKey = 'local';
    if (isOnlineMode(this.config.mode)) {
      apiKey = (await this.secrets.get(apiKeySecretName(this.config.mode))) ?? '';
      if (!apiKey) {
        throw new MissingApiKeyError(this.config.mode);
      }
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  private toError(error: unknown, userSignal: AbortSignal | undefined): Error {
    if (userSignal?.aborted) {
      return new CancelledError();
    }
    if (error instanceof MissingApiKeyError) {
      return error;
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return new Error(
        `${this.label} did not respond within ${this.config.requestTimeoutMs / 1000}s. `
        + 'Increase the request timeout setting or use a smaller model.',
      );
    }

    const detail = error instanceof Error ? error.message : String(error);
    return new Error(`Could not reach ${this.label} at ${this.config.baseUrl}: ${detail}. ${this.troubleshootingHint()}`);
  }

  private troubleshootingHint(): string {
    switch (this.config.mode) {
      case 'offline-ollama':
        return `Make sure Ollama is running and the model is pulled (ollama pull ${this.config.model}).`;
      case 'offline-lmstudio':
        return 'Make sure the LM Studio local server is running and a chat model is loaded.';
      default:
        return 'Verify your API key, selected model, and network connection.';
    }
  }
}

class MissingApiKeyError extends Error {
  constructor(mode: AiMode) {
    super(missingApiKeyMessage(mode));
    this.name = 'MissingApiKeyError';
  }
}

async function readModelIds(response: Response): Promise<string[] | undefined> {
  try {
    const body = await response.json() as { data?: Array<{ id?: unknown }> };
    return body.data?.map((model) => model.id).filter((id): id is string => typeof id === 'string');
  } catch {
    return undefined;
  }
}

/** Ollama resolves "name" to "name:latest". */
function modelIsInstalled(model: string, installed: string[]): boolean {
  return installed.includes(model) || (!model.includes(':') && installed.includes(`${model}:latest`));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return 'The provider returned no error details.';
  }

  try {
    const parsed = JSON.parse(text) as ErrorResponseBody;
    return parsed.error?.message ?? parsed.message ?? text.slice(0, 500);
  } catch {
    return text.slice(0, 500);
  }
}

export function createAiProvider(config: AiConfig, secrets: SecretStore): AiProvider {
  return new OpenAiCompatibleProvider(config, secrets);
}
