import * as assert from 'assert';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as vscode from 'vscode';
import { CancelledError, createAiProvider } from '../../core/ai/aiProvider';
import { resolveAiConfig } from '../../core/ai/aiConfig';
import type { SecretStore } from '../../core/platform';
import type { SandboxAtlasApi } from '../../extension/extension';

const extensionId = 'nexkeys.sandbox-atlas';
/** Polls until `condition` holds; the workbench updates tabs and documents asynchronously. */
async function waitFor(condition: () => boolean, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return condition();
}

const noSecrets: SecretStore = { get: async () => undefined, store: async () => undefined, delete: async () => undefined };

suite('Sandbox Atlas extension', () => {
  let api: SandboxAtlasApi;

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension<SandboxAtlasApi>(extensionId);
    assert.ok(extension, `extension ${extensionId} not found`);
    api = await extension.activate();
  });

  teardown(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  test('activates and registers every contributed command', async () => {
    const contributed = (vscode.extensions.getExtension(extensionId)!.packageJSON.contributes.commands as Array<{ command: string }>)
      .map((entry) => entry.command);
    const registered = new Set(await vscode.commands.getCommands(true));
    contributed.forEach((command) => assert.ok(registered.has(command), `${command} is not registered`));
  });

  test('indexes the workspace and reaches the ready state', async () => {
    assert.notStrictEqual(api.getIndexStatus(), 'unavailable', 'engine failed to start (node:sqlite unavailable?)');
    await vscode.commands.executeCommand('sandboxAtlas.scanWorkspace');
    assert.strictEqual(api.getIndexStatus(), 'ready');
  });

  test('project map opens as a markdown preview', async () => {
    await vscode.commands.executeCommand('sandboxAtlas.generateProjectMap');
    const markdown = vscode.workspace.textDocuments.find((document) => document.languageId === 'markdown' && document.isUntitled);
    assert.ok(markdown, 'no project map document opened');
    assert.match(markdown.getText(), /# Atlas: sample/);
    assert.match(markdown.getText(), /`src\/greet\.ts` — imported by|greet\.ts/);
  });

  test('dependency graph panel opens', async () => {
    await vscode.commands.executeCommand('sandboxAtlas.showGraph');
    const tabs = () => vscode.window.tabGroups.all.flatMap((group) => group.tabs);
    const opened = await waitFor(() => tabs().some((tab) => tab.label.startsWith('Atlas Graph')));
    assert.ok(opened, `graph tab missing: ${tabs().map((tab) => tab.label).join(', ')}`);
  });

  suite('AI provider (mock OpenAI-compatible server)', () => {
    let server: http.Server;
    let baseUrl: string;
    let lastRequest: { authorization?: string; body: { model: string } } | undefined;

    suiteSetup(async () => {
      server = http.createServer((request, response) => {
        let body = '';
        request.on('data', (chunk) => {
          body += chunk;
        });
        request.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          lastRequest = { authorization: request.headers.authorization, body: parsed };
          if (parsed.model === 'slow-model') {
            return; // never answers: exercises cancellation
          }
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({
            model: parsed.model,
            choices: [{ message: { content: '## Most Relevant Files\n- src/greet.ts' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }));
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    });

    suiteTeardown(() => {
      server.closeAllConnections();
      server.close();
    });

    const provider = (mode: 'offline-ollama' | 'online-openai', model: string) => (
      createAiProvider(resolveAiConfig({ mode, baseUrl, offlineModel: model, onlineModel: model }), noSecrets)
    );

    test('sends an OpenAI-compatible request and returns content', async () => {
      const result = await provider('offline-ollama', 'test-model').completeChat([{ role: 'user', content: 'trace greet' }]);
      assert.strictEqual(result.content, '## Most Relevant Files\n- src/greet.ts');
      assert.strictEqual(result.totalTokens, 15);
      assert.strictEqual(lastRequest?.body.model, 'test-model');
      assert.strictEqual(lastRequest?.authorization, 'Bearer local');
    });

    test('user cancellation aborts the request with CancelledError', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 200);
      await assert.rejects(
        provider('offline-ollama', 'slow-model').completeChat([{ role: 'user', content: 'x' }], { signal: controller.signal }),
        (error: unknown) => error instanceof CancelledError,
      );
    });

    test('online mode without a stored key fails with guidance', async () => {
      await assert.rejects(provider('online-openai', 'gpt-test').completeChat([{ role: 'user', content: 'x' }]), /Set AI API Key/);
    });

    test('connection check reports reachability', async () => {
      assert.strictEqual(await provider('offline-ollama', 'test-model').checkConnection(), undefined);
    });
  });
});
