import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AtlasEngine, silentLogger, type AiSettings, type KeyValueStore, type SecretStore } from '../../core';

/** A small React/TS project exercising aliases, barrels, nested .gitignore and ignored dirs. */
export const fixtureFiles: Record<string, string> = {
  '.gitignore': 'ignored/\n',
  'README.md': '# Demo App\n\n## Setup\n\nRun `npm install` then `npm start`.\n\n## Architecture\n\nAuth lives in src/auth.\n',
  'src/api/client.ts': 'export async function fetchUser(id: string): Promise<string> {\n  return id;\n}\n',
  'src/api/index.ts': "export { fetchUser } from './client';\n",
  'src/auth/login.ts': "import { fetchUser } from '../api';\n\nexport function login(user: string) {\n  return fetchUser(user);\n}\n",
  'src/components/LoginForm.tsx': "import { useState } from 'react';\nimport { login } from '@/auth/login';\n\nexport default function LoginForm() {\n  const [name] = useState('');\n  login(name);\n  return <form>{name}</form>;\n}\n",
  'src/app.ts': "import LoginForm from './components/LoginForm.js';\n\nexport const app = LoginForm;\n",
  'src/legacy.js': "const client = require('./api/client');\nmodule.exports = () => import('./auth/login');\n",
  'src/vendor/lib.min.js': 'var a=1;',
  'ignored/secret.ts': 'export const token = "do-not-index";\n',
  'packages/tool/.gitignore': 'generated.ts\n',
  'packages/tool/generated.ts': 'export const generated = true;\n',
  'packages/tool/keep.ts': 'export const keep = true;\n',
  'node_modules/pkg/index.js': 'module.exports = {};\n',
};

export interface Fixture {
  root: string;
  engine: AtlasEngine;
  settings: AiSettings;
  secrets: Map<string, string>;
  abs(relativePath: string): string;
  dispose(): void;
}

export function createFixture(files: Record<string, string> = fixtureFiles): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-fixture-'));
  Object.entries(files).forEach(([relativePath, content]) => {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  });

  const secrets = new Map<string, string>();
  const secretStore: SecretStore = {
    get: async (key) => secrets.get(key),
    store: async (key, value) => void secrets.set(key, value),
    delete: async (key) => void secrets.delete(key),
  };
  const state = new Map<string, unknown>();
  const stateStore: KeyValueStore = {
    get: <T>(key: string) => state.get(key) as T | undefined,
    update: async (key, value) => void state.set(key, value),
  };
  const settings: AiSettings = { mode: 'offline-ollama' };

  const engine = new AtlasEngine({
    databasePath: ':memory:',
    logger: silentLogger,
    secrets: secretStore,
    state: stateStore,
    readAiSettings: () => settings,
  });

  return {
    root,
    engine,
    settings,
    secrets,
    abs: (relativePath) => path.join(root, relativePath),
    dispose: () => {
      engine.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
