import * as assert from 'assert';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { buildChatRequest, resolveAiConfig, type SecretStore } from '../../core';
import { createAiProvider } from '../../core/ai/aiProvider';
import { parseStreamChunk, SseParser } from '../../core/ai/sse';
import { chatCommands, chatHelpMarkdown, parseChatInput } from '../../shared/chatCommands';
import { createFixture, type Fixture } from './fixture';

const noSecrets: SecretStore = { get: async () => undefined, store: async () => undefined, delete: async () => undefined };

suite('Chat: streaming', () => {
  test('SSE parser handles events split across chunks and ignores [DONE]', () => {
    const events: string[] = [];
    const parser = new SseParser((data) => events.push(data));
    parser.push('data: {"a":1}\n\ndata: {"b"');
    parser.push(':2}\n\n: keep-alive comment\ndata: [DONE]\n');
    parser.push('data: {"c":3}');
    parser.flush();
    assert.deepStrictEqual(events, ['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  test('stream chunks yield text deltas and usage', () => {
    assert.deepStrictEqual(parseStreamChunk('{"choices":[{"delta":{"content":"Hi"}}]}').text, 'Hi');
    assert.strictEqual(parseStreamChunk('{"usage":{"total_tokens":9}}').usage?.total_tokens, 9);
    assert.strictEqual(parseStreamChunk('not json').text, '');
  });

  test('completeChat streams tokens from an OpenAI-compatible server', async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const parts = ['Atlas', ' maps', ' code.'];
      parts.forEach((part) => response.write(`data: ${JSON.stringify({ model: 'mock', choices: [{ delta: { content: part } }] })}\n\n`));
      response.end('data: [DONE]\n\n');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
      const provider = createAiProvider(resolveAiConfig({ mode: 'offline-ollama', baseUrl }), noSecrets);
      const tokens: string[] = [];
      const result = await provider.completeChat([{ role: 'user', content: 'hi' }], { onToken: (text) => tokens.push(text) });

      assert.deepStrictEqual(tokens, ['Atlas', ' maps', ' code.']);
      assert.strictEqual(result.content, 'Atlas maps code.');
      assert.strictEqual(result.model, 'mock');
      assert.ok(result.totalTokens > 0);
    } finally {
      server.close();
    }
  });
});

suite('Chat: commands', () => {
  test('parses questions, commands with arguments and unknown commands', () => {
    assert.deepStrictEqual(parseChatInput('  where is auth? '), { kind: 'ask', text: 'where is auth?' });
    assert.deepStrictEqual(parseChatInput('/trace  user login'), { kind: 'command', name: 'trace', args: 'user login' });
    assert.deepStrictEqual(parseChatInput('/MAP'), { kind: 'command', name: 'map', args: '' });
    assert.deepStrictEqual(parseChatInput('/nope'), { kind: 'unknown-command', name: 'nope' });
  });

  test('help lists every command', () => {
    const help = chatHelpMarkdown();
    chatCommands.forEach((command) => assert.ok(help.includes(`/${command.name}`), command.name));
  });
});

suite('Chat: request building', () => {
  let fixture: Fixture;

  suiteSetup(async () => {
    fixture = createFixture();
    await fixture.engine.indexer.index(fixture.root);
  });

  suiteTeardown(() => fixture.dispose());

  test('workspace question: system prompt, then the question with context', () => {
    const request = buildChatRequest(fixture.engine.synthesizer, fixture.root, 'where is login?', [], 2400);
    assert.strictEqual(request.messages[0].role, 'system');
    assert.strictEqual(request.messages.at(-1)!.role, 'user');
    assert.match(request.messages.at(-1)!.content, /^where is login\?\n\n---\n\n# Sandbox Atlas Repository Context/);
    assert.match(request.contextLabel, /indexed sources/);
  });

  test('focus file centres the context on it and its dependents', () => {
    const request = buildChatRequest(fixture.engine.synthesizer, fixture.root, 'what does this do?', [], 2400, fixture.abs('src/api/client.ts'));
    assert.match(request.contextLabel, /^src\/api\/client\.ts \+ \d+ dependents$/);
    assert.match(request.messages.at(-1)!.content, /Target File: src\/api\/client\.ts/);
  });

  test('history: recent turns within budget, starting with a user turn', () => {
    const long = 'x'.repeat(5000);
    const history = [
      { role: 'assistant' as const, content: 'orphan answer' },
      { role: 'user' as const, content: 'first question' },
      { role: 'assistant' as const, content: long },
      { role: 'user' as const, content: 'second question' },
      { role: 'assistant' as const, content: 'second answer' },
    ];
    const request = buildChatRequest(fixture.engine.synthesizer, fixture.root, 'third', history, 2400);
    const turns = request.messages.slice(1, -1);
    assert.strictEqual(turns[0].role, 'user', 'history starts with a user turn');
    assert.ok(!turns.some((turn) => turn.content === 'orphan answer'));
    assert.ok(turns.every((turn) => turn.content.length < 1700), 'long answers are clipped');
    assert.deepStrictEqual(turns.slice(-2).map((turn) => turn.content), ['second question', 'second answer']);
  });
});
