import { resolveAiConfig, type AiConfig, type AiSettings } from './ai/aiConfig';
import { createAiProvider, type AiProvider } from './ai/aiProvider';
import { UsageLimiter } from './ai/usageLimiter';
import { ContextSynthesizer } from './context/contextSynthesizer';
import type { AiRequest } from './features/aiFeatures';
import { runAiRequest, type AiRunResult } from './features/runAiRequest';
import { AtlasIndexer } from './indexing/atlasIndexer';
import type { KeyValueStore, Logger, SecretStore } from './platform';
import { AtlasDatabase } from './storage/atlasDatabase';
import { AtlasStore } from './storage/atlasStore';

export interface AtlasEngineOptions {
  /** SQLite file path, or ':memory:'. */
  databasePath: string;
  logger: Logger;
  secrets: SecretStore;
  state: KeyValueStore;
  /** Read on every AI call so settings changes apply immediately. */
  readAiSettings: () => AiSettings;
}

/**
 * The Sandbox Atlas engine: everything except UI. A host (VS Code extension, CLI, desktop app)
 * constructs one engine, supplies the platform ports, and renders the results its own way.
 */
export class AtlasEngine {
  readonly store: AtlasStore;
  readonly indexer: AtlasIndexer;
  readonly synthesizer: ContextSynthesizer;
  readonly usage: UsageLimiter;

  constructor(private readonly options: AtlasEngineOptions) {
    this.store = new AtlasStore(new AtlasDatabase(options.databasePath));
    this.indexer = new AtlasIndexer(this.store, options.logger);
    this.synthesizer = new ContextSynthesizer(this.store);
    this.usage = new UsageLimiter(options.state);
  }

  get logger(): Logger {
    return this.options.logger;
  }

  get secrets(): SecretStore {
    return this.options.secrets;
  }

  aiConfig(): AiConfig {
    return resolveAiConfig(this.options.readAiSettings());
  }

  createProvider(config: AiConfig = this.aiConfig()): AiProvider {
    return createAiProvider(config, this.options.secrets);
  }

  /** Runs a prepared request with the current settings, enforcing the daily limit. */
  runAi(request: AiRequest, signal?: AbortSignal): Promise<AiRunResult> {
    const config = this.aiConfig();
    return runAiRequest(request, this.createProvider(config), this.usage, config.dailyRequestLimit, signal);
  }

  dispose(): void {
    this.indexer.dispose();
    this.store.close();
  }
}
