import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseArgs } from 'util';
import {
  AtlasEngine,
  CancelledError,
  FeatureInputError,
  apiKeySecretName,
  aiModes,
  buildEditPlanRequest,
  buildGraphData,
  buildImpactAnalysisRequest,
  buildProjectMap,
  buildSummarizeDocsRequest,
  buildTraceFeatureRequest,
  describeError,
  resolveAiConfig,
  type AiConfig,
  type AiReadiness,
  type AiRequest,
  type AiSettings,
  type KeyValueStore,
  type Logger,
  type SecretStore,
} from '../core';

/**
 * `atlas` — the Sandbox Atlas engine on the command line. Same engine as the VS Code extension;
 * this host is also the starting point for a standalone executable (see docs/ARCHITECTURE.md).
 */

const usage = `Sandbox Atlas CLI

Usage: atlas <command> [arguments] [options]

Commands:
  index                   Index (or incrementally refresh) the workspace
  stats                   Show index statistics
  map [--out FILE]        Print the project map (or write it, e.g. --out ATLAS.md)
  graph [--focus FILE]    Print the dependency graph as JSON
  trace "<query>"         AI: find where a feature lives
  docs                    AI: summarize project documentation
  impact <file>           AI: what breaks if <file> changes
  plan <file> "<intent>"  AI: step-by-step edit plan

Options:
  --dir DIR               Workspace root (default: current directory)
  --mode MODE             AI provider: ${aiModes.join(' | ')}
  --model NAME            Model override
  --base-url URL          OpenAI-compatible endpoint override
  --timeout SECONDS       AI request timeout (default: 300 local, 120 online)
  --db FILE               Index database (default: ~/.sandbox-atlas/atlas.sqlite)
  --include-ignored       Also index files matched by .gitignore
  --verbose               Log progress to stderr
  -h, --help              Show this help

Environment:
  ATLAS_AI_MODE, ATLAS_AI_MODEL, ATLAS_AI_BASE_URL, ATLAS_AI_TIMEOUT, ATLAS_DAILY_LIMIT
  ATLAS_API_KEY (any online provider) or ATLAS_GEMINI_API_KEY / ATLAS_OPENAI_API_KEY / ATLAS_OPENROUTER_API_KEY
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      mode: { type: 'string' },
      model: { type: 'string' },
      'base-url': { type: 'string' },
      timeout: { type: 'string' },
      db: { type: 'string' },
      out: { type: 'string' },
      focus: { type: 'string' },
      'include-ignored': { type: 'boolean' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const [command, ...args] = positionals;
  if (values.help || !command) {
    process.stdout.write(usage);
    return command || values.help ? 0 : 1;
  }

  const root = path.resolve(values.dir ?? process.cwd());
  const dataDir = path.join(os.homedir(), '.sandbox-atlas');
  const settings: AiSettings = {
    mode: values.mode ?? process.env.ATLAS_AI_MODE,
    offlineModel: values.model ?? process.env.ATLAS_AI_MODEL,
    onlineModel: values.model ?? process.env.ATLAS_AI_MODEL,
    baseUrl: values['base-url'] ?? process.env.ATLAS_AI_BASE_URL,
    requestTimeoutSeconds: optionalNumber(values.timeout ?? process.env.ATLAS_AI_TIMEOUT),
    dailyRequestLimit: optionalNumber(process.env.ATLAS_DAILY_LIMIT),
  };

  const engine = new AtlasEngine({
    databasePath: values.db ?? path.join(dataDir, 'atlas.sqlite'),
    logger: stderrLogger(values.verbose ?? false),
    secrets: envSecretStore(),
    state: jsonFileStore(path.join(dataDir, 'state.json')),
    readAiSettings: () => settings,
  });

  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());

  try {
    const result = await engine.indexer.index(root, { includeIgnored: values['include-ignored'] });
    const budget = engine.aiConfig().contextTokenBudget;
    const resolveFile = (file: string | undefined) => {
      if (!file) {
        throw new FeatureInputError(`Missing <file>. Run "atlas --help".`);
      }
      return path.resolve(root, file);
    };
    const runAi = async (request: AiRequest) => {
      const readiness = await engine.createProvider().checkReadiness();
      if (!readiness.ready) {
        throw new FeatureInputError(readinessGuidance(readiness, engine.aiConfig()));
      }
      process.stderr.write(`Asking ${engine.createProvider().displayName}…\n`);
      const { markdown } = await engine.runAi(request, controller.signal);
      process.stdout.write(markdown);
    };

    switch (command) {
      case 'index':
        process.stdout.write(`Indexed ${result.totalFiles} files (${result.filesReparsed} re-parsed) in ${result.durationMs}ms.\n`);
        break;
      case 'stats':
        process.stdout.write(`${JSON.stringify(engine.store.getStats(root), null, 2)}\n`);
        break;
      case 'map': {
        const map = buildProjectMap(engine.store, root);
        if (values.out) {
          fs.writeFileSync(path.resolve(root, values.out), map);
          process.stderr.write(`Wrote ${values.out}\n`);
        } else {
          process.stdout.write(map);
        }
        break;
      }
      case 'graph':
        process.stdout.write(`${JSON.stringify(buildGraphData(engine.store, root, { focus: values.focus && resolveFile(values.focus) }), null, 2)}\n`);
        break;
      case 'trace':
        await runAi(buildTraceFeatureRequest(engine.synthesizer, root, requireText(args.join(' '), 'query'), budget));
        break;
      case 'docs':
        await runAi(buildSummarizeDocsRequest(engine.synthesizer, root, budget));
        break;
      case 'impact':
        await runAi(buildImpactAnalysisRequest(engine.synthesizer, root, resolveFile(args[0]), budget));
        break;
      case 'plan':
        await runAi(buildEditPlanRequest(engine.synthesizer, root, resolveFile(args[0]), requireText(args.slice(1).join(' '), 'intent'), budget));
        break;
      default:
        process.stderr.write(`Unknown command "${command}".\n\n${usage}`);
        return 1;
    }
    return 0;
  } catch (error) {
    if (error instanceof CancelledError) {
      return 130;
    }
    process.stderr.write(`atlas: ${describeError(error)}\n`);
    return 1;
  } finally {
    engine.dispose();
  }
}

/** Turns a readiness failure into copy-paste next steps for the terminal. */
function readinessGuidance(readiness: Exclude<AiReadiness, { ready: true }>, config: AiConfig): string {
  // In online modes config.model is a hosted model; Ollama advice must name a local one.
  const localModel = config.mode.startsWith('offline') ? config.model : resolveAiConfig({}).model;
  const noModelHelp = [
    'No local model? Either:',
    `  • Install Ollama (https://ollama.com/download), then run: ollama pull ${localModel}`,
    "  • Or use Gemini's free tier (key: https://aistudio.google.com/apikey):",
    '      ATLAS_API_KEY=<your-key> atlas <command> --mode online-gemini',
    'The index, stats, map and graph commands work without AI.',
  ].join('\n');

  switch (readiness.reason) {
    case 'unreachable':
      return config.mode.startsWith('offline') ? `${readiness.message}\n\n${noModelHelp}` : readiness.message;
    case 'model-missing': {
      const installed = readiness.availableModels ?? [];
      return `${readiness.message}\nRun: ollama pull ${config.model}`
        + (installed.length ? `\nOr use an installed one: --model ${installed[0]}  (installed: ${installed.join(', ')})` : '');
    }
    case 'missing-key':
      return `${readiness.message}\n\n${noModelHelp}`;
    default:
      return readiness.message;
  }
}

function optionalNumber(value: string | undefined): number | undefined {
  return value && Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function requireText(value: string, name: string): string {
  if (!value.trim()) {
    throw new FeatureInputError(`Missing <${name}>. Run "atlas --help".`);
  }
  return value.trim();
}

function stderrLogger(verbose: boolean): Logger {
  const write = (level: string, message: string) => verbose && process.stderr.write(`[${level}] ${message}\n`);
  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => process.stderr.write(`[error] ${message}\n`),
  };
}

/** API keys come from the environment; nothing is persisted. */
function envSecretStore(): SecretStore {
  return {
    get: async (key) => {
      const provider = aiModes.find((mode) => apiKeySecretName(mode) === key)?.replace('online-', '').toUpperCase();
      return (provider && process.env[`ATLAS_${provider}_API_KEY`]) || process.env.ATLAS_API_KEY || undefined;
    },
    store: async () => {
      throw new Error('Set API keys with environment variables (ATLAS_API_KEY).');
    },
    delete: async () => undefined,
  };
}

function jsonFileStore(filePath: string): KeyValueStore {
  const read = (): Record<string, unknown> => {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  return {
    get: <T>(key: string) => read()[key] as T | undefined,
    update: async (key, value) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify({ ...read(), [key]: value }, null, 2));
    },
  };
}

// node:sqlite prints an ExperimentalWarning on Node 22–24; keep CLI output clean.
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (!(warning.name === 'ExperimentalWarning' && /SQLite/i.test(warning.message))) {
    process.stderr.write(`${warning.name}: ${warning.message}
`);
  }
});

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`atlas: ${describeError(error)}
`);
    process.exitCode = 1;
  },
);
