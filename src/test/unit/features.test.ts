import * as assert from 'assert';
import {
  apiKeySecretName,
  buildEditPlanRequest,
  buildGraphData,
  buildImpactAnalysisRequest,
  buildProjectMap,
  buildSummarizeDocsRequest,
  buildTraceFeatureRequest,
  FeatureInputError,
  resolveAiConfig,
  UsageLimitError,
  type KeyValueStore,
} from '../../core';
import type { AiProvider } from '../../core/ai/aiProvider';
import { UsageLimiter } from '../../core/ai/usageLimiter';
import { runAiRequest } from '../../core/features/runAiRequest';
import { createFixture, type Fixture } from './fixture';

function memoryState(): KeyValueStore {
  const state = new Map<string, unknown>();
  return { get: <T>(key: string) => state.get(key) as T | undefined, update: async (key, value) => void state.set(key, value) };
}

function fakeProvider(mode: AiProvider['mode'] = 'offline-ollama'): AiProvider & { calls: number } {
  return {
    mode,
    displayName: 'Fake (test)',
    calls: 0,
    checkReadiness: async () => ({ ready: true }),
    async completeChat(messages) {
      this.calls += 1;
      return { content: `answer to ${messages.length} messages`, model: 'test', provider: 'Fake (test)', promptTokens: 10, completionTokens: 5, totalTokens: 15 };
    },
  };
}

suite('Features', () => {
  let fixture: Fixture;

  suiteSetup(async () => {
    fixture = createFixture();
    await fixture.engine.indexer.index(fixture.root);
  });

  suiteTeardown(() => fixture.dispose());

  test('project map lists overview, hubs, entry points, docs and folders', () => {
    const map = buildProjectMap(fixture.engine.store, fixture.root);
    assert.match(map, /^# Atlas: atlas-fixture-/);
    assert.match(map, /\| Code files \| 7 /);
    assert.match(map, /\| React components \| 1 \|/);
    assert.match(map, /## Likely entry points[\s\S]*`src\/app\.ts`/);
    assert.match(map, /`README\.md` — Demo App _\(setup, architecture\)_/);
    assert.match(map, /### src\/components\/\n\n- `LoginForm\.tsx` — <LoginForm>/);
  });

  test('graph data: whole workspace and focused neighbourhood', () => {
    const all = buildGraphData(fixture.engine.store, fixture.root);
    assert.strictEqual(all.nodes.length, 7);
    assert.ok(all.edges.some((edge) => edge.source === fixture.abs('src/app.ts') && edge.target === fixture.abs('src/components/LoginForm.tsx')));

    const focused = buildGraphData(fixture.engine.store, fixture.root, { focus: fixture.abs('src/app.ts'), depth: 1 });
    assert.deepStrictEqual(focused.nodes.map((node) => node.label).sort(), ['LoginForm.tsx', 'app.ts']);
    assert.strictEqual(focused.nodes.find((node) => node.isFocus)?.label, 'app.ts');
    assert.strictEqual(focused.nodes.find((node) => node.label === 'LoginForm.tsx')?.kind, 'component');

    const capped = buildGraphData(fixture.engine.store, fixture.root, { maxNodes: 3 });
    assert.strictEqual(capped.nodes.length, 3);
    assert.strictEqual(capped.truncated, true);
  });

  test('AI request builders produce prompts and reject unindexed targets', () => {
    const { synthesizer } = fixture.engine;
    assert.match(buildTraceFeatureRequest(synthesizer, fixture.root, 'login', 3000).userContent, /Feature query: "login"/);
    assert.match(buildSummarizeDocsRequest(synthesizer, fixture.root, 3000).userContent, /Documentation: README\.md/);
    assert.match(buildImpactAnalysisRequest(synthesizer, fixture.root, fixture.abs('src/api/client.ts'), 3000).footerLines.join(), /Direct dependents:\*\* 2/);
    assert.match(buildEditPlanRequest(synthesizer, fixture.root, fixture.abs('src/app.ts'), 'add routing', 3000).userContent, /Edit intent: "add routing"/);
    assert.throws(() => buildImpactAnalysisRequest(synthesizer, fixture.root, fixture.abs('ignored/secret.ts'), 3000), FeatureInputError);
  });

  test('runAiRequest renders markdown and records usage', async () => {
    const limiter = new UsageLimiter(memoryState());
    const provider = fakeProvider();
    const request = buildTraceFeatureRequest(fixture.engine.synthesizer, fixture.root, 'login', 3000);
    const result = await runAiRequest(request, provider, limiter, 100);

    assert.match(result.markdown, /^# Feature Trace: "login"\n\nanswer to 2 messages/);
    assert.match(result.markdown, /\*\*Provider:\*\* Fake \(test\) · 15 tokens/);
    assert.deepStrictEqual([result.usage.requests, result.usage.tokens], [1, 15]);
  });

  test('daily limit blocks online providers only, and resets the next day', async () => {
    let now = new Date(2026, 9, 12, 23, 0);
    const limiter = new UsageLimiter(memoryState(), () => now);
    const request = buildTraceFeatureRequest(fixture.engine.synthesizer, fixture.root, 'login', 3000);
    const online = fakeProvider('online-openai');

    await runAiRequest(request, online, limiter, 1);
    await assert.rejects(runAiRequest(request, online, limiter, 1), UsageLimitError);
    assert.strictEqual(online.calls, 1);

    await runAiRequest(request, fakeProvider('offline-ollama'), limiter, 1);
    await runAiRequest(request, online, limiter, 0);

    now = new Date(2026, 9, 13, 8, 0);
    assert.strictEqual(limiter.getToday().requests, 0);
    await runAiRequest(request, online, limiter, 1);
  });

  test('AI config: defaults, overrides and invalid modes', () => {
    assert.deepStrictEqual(resolveAiConfig({}), {
      mode: 'offline-ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5-coder:3b',
      requestTimeoutMs: 300_000,
      dailyRequestLimit: 100,
      contextTokenBudget: 2400,
    });

    const gemini = resolveAiConfig({ mode: 'online-gemini', onlineModel: ' ', offlineModel: 'ignored', baseUrl: '' });
    assert.strictEqual(gemini.model, 'gemini-2.5-flash');
    assert.strictEqual(gemini.contextTokenBudget, 8000);
    assert.strictEqual(resolveAiConfig({ mode: 'nonsense' }).mode, 'offline-ollama');
    assert.strictEqual(resolveAiConfig({ requestTimeoutSeconds: 1 }).requestTimeoutMs, 10_000);
    assert.strictEqual(resolveAiConfig({ mode: 'online-openai', requestTimeoutSeconds: 0 }).requestTimeoutMs, 120_000);
    assert.strictEqual(apiKeySecretName('online-openai'), 'sandboxAtlas.apiKey.online-openai');
  });

  test('engine provider reads API keys from the secret store', async () => {
    fixture.settings.mode = 'online-openai';
    await assert.rejects(fixture.engine.createProvider().completeChat([{ role: 'user', content: 'x' }]), /No API key set for OpenAI/);
    fixture.settings.mode = 'offline-ollama';
  });
});
