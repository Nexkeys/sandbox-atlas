import * as assert from 'assert';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { resolveAiConfig, type AiMode, type SecretStore } from '../../core';
import { createAiProvider } from '../../core/ai/aiProvider';

function secrets(values: Record<string, string> = {}): SecretStore {
  return { get: async (key) => values[key], store: async () => undefined, delete: async () => undefined };
}

suite('AI readiness', () => {
  let server: http.Server;
  let baseUrl: string;
  let closedUrl: string;

  suiteSetup(async () => {
    // Mock Ollama / OpenAI-compatible server: lists two models; rejects a bad key.
    server = http.createServer((request, response) => {
      if (request.headers.authorization === 'Bearer bad-key') {
        response.writeHead(401).end('{"error":{"message":"invalid key"}}');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'qwen2.5-coder:3b' }, { id: 'llama3.2:latest' }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

    // A port that was just freed: nothing listens there.
    const probe = http.createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    closedUrl = `http://127.0.0.1:${(probe.address() as AddressInfo).port}/v1`;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  });

  suiteTeardown(() => {
    server.close();
  });

  const check = (mode: AiMode, model: string, url = baseUrl, keys: Record<string, string> = {}) => (
    createAiProvider(resolveAiConfig({ mode, baseUrl: url, offlineModel: model, onlineModel: model }), secrets(keys)).checkReadiness()
  );

  test('ready when the local model is installed', async () => {
    assert.deepStrictEqual(await check('offline-ollama', 'qwen2.5-coder:3b'), { ready: true });
  });

  test('an untagged name matches the :latest tag', async () => {
    assert.deepStrictEqual(await check('offline-ollama', 'llama3.2'), { ready: true });
  });

  test('model-missing lists the installed models', async () => {
    const readiness = await check('offline-ollama', 'qwen2.5-coder:7b');
    assert.strictEqual(readiness.ready, false);
    assert.ok(!readiness.ready && readiness.reason === 'model-missing');
    assert.deepStrictEqual(!readiness.ready && readiness.availableModels, ['qwen2.5-coder:3b', 'llama3.2:latest']);
  });

  test('unreachable when no local server is running', async () => {
    const readiness = await check('offline-ollama', 'qwen2.5-coder:3b', closedUrl);
    assert.ok(!readiness.ready && readiness.reason === 'unreachable', JSON.stringify(readiness));
    assert.match(!readiness.ready ? readiness.message : '', /Ollama is running/);
  });

  test('missing-key for online providers without a key', async () => {
    const readiness = await check('online-gemini', 'gemini-2.5-flash');
    assert.ok(!readiness.ready && readiness.reason === 'missing-key');
  });

  test('rejected when the provider refuses the key', async () => {
    const readiness = await check('online-openai', 'gpt-4o-mini', baseUrl, { 'sandboxAtlas.apiKey.online-openai': 'bad-key' });
    assert.ok(!readiness.ready && readiness.reason === 'rejected');
    assert.match(!readiness.ready ? readiness.message : '', /rejected/);
  });

  test('online providers skip the model check', async () => {
    const readiness = await check('online-openai', 'any-hosted-model', baseUrl, { 'sandboxAtlas.apiKey.online-openai': 'good-key' });
    assert.deepStrictEqual(readiness, { ready: true });
  });
});
