import * as vscode from 'vscode';
import {
  buildChatRequest,
  buildEditPlanRequest,
  buildImpactAnalysisRequest,
  buildProjectMap,
  buildSummarizeDocsRequest,
  buildTraceFeatureRequest,
  CancelledError,
  describeError,
  relativePosix,
  type AiRequest,
  type ChatTurn,
} from '../../core';
import { isSafeHref, renderMarkdown } from '../../core/util/markdown';
import { chatHelpMarkdown, parseChatInput } from '../../shared/chatCommands';
import type { ChatContextView, ChatMessageView, ChatToHostMessage, HostToChatMessage } from '../../shared/chatProtocol';
import type { AtlasSession } from '../atlasSession';
import { ensureAiReady } from '../commands/aiSetup';
import { resolveRoot, rootForUri } from '../host/workspaceRoots';
import { webviewHtml } from './webviewHtml';

/** A stored message: markdown is the source of truth; HTML is rendered when shown. */
interface StoredMessage {
  id: string;
  role: ChatMessageView['role'];
  markdown: string;
  meta?: string;
  error?: boolean;
  /** Included in the conversation history sent to the model. */
  history?: ChatTurn['role'];
}

const transcriptKey = 'sandboxAtlas.chat.transcript';
const maxStoredMessages = 60;
const streamFlushMs = 40;

/**
 * "Chat" sidebar view: ask questions about the codebase in plain English, or use slash
 * commands. Answers stream in, use the local index as context, and can focus on a file.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'sandboxAtlas.chat';

  private view: vscode.WebviewView | undefined;
  private messages: StoredMessage[];
  private busy = false;
  private abort: AbortController | undefined;
  private followEditor = true;
  private attachedFile: string | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly session: AtlasSession,
    private readonly workspaceState: vscode.Memento,
  ) {
    this.messages = workspaceState.get<StoredMessage[]>(transcriptKey) ?? [];
    this.syncActiveEditor();
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.syncActiveEditor();
        this.postContext();
      }),
      session.onDidChange(() => this.postContext()),
      session.appearance.onDidChange((appearance) => this.post({ type: 'appearance', appearance })),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.session.extensionUri, 'dist', 'webview')],
    };
    view.webview.html = webviewHtml(view.webview, this.session.extensionUri, 'chat', 'Atlas Chat');
    view.webview.onDidReceiveMessage((message: ChatToHostMessage) => void this.onMessage(message), undefined, this.subscriptions);
    view.onDidDispose(() => {
      this.view = undefined;
    }, undefined, this.subscriptions);
  }

  /** Focuses the chat, optionally attaching a file and pre-filling the input. */
  async open(file?: vscode.Uri, prefill?: string): Promise<void> {
    if (file?.scheme === 'file') {
      this.followEditor = false;
      this.attachedFile = file.fsPath;
    }
    await vscode.commands.executeCommand(`${ChatViewProvider.viewId}.focus`);
    this.postContext();
    if (prefill) {
      this.post({ type: 'prefill', text: prefill });
    }
  }

  dispose(): void {
    this.abort?.abort();
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  // ── Webview messages ──────────────────────────────────────────────────────

  private async onMessage(message: ChatToHostMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.post({ type: 'appearance', appearance: this.session.appearance.state });
        this.postContext();
        this.post({ type: 'transcript', messages: await Promise.all(this.messages.map((stored) => this.toView(stored))) });
        this.post({ type: 'busy', busy: this.busy });
        break;
      case 'send':
        await this.handleInput(message.text);
        break;
      case 'stop':
        this.abort?.abort();
        break;
      case 'clear':
        this.abort?.abort();
        this.messages = [];
        await this.persist();
        this.post({ type: 'transcript', messages: [] });
        break;
      case 'detach':
        this.followEditor = false;
        this.attachedFile = undefined;
        this.postContext();
        break;
      case 'attachActive':
        this.followEditor = true;
        this.syncActiveEditor();
        this.postContext();
        break;
      case 'copy': {
        const stored = this.messages.find((item) => item.id === message.id);
        if (stored) {
          await vscode.env.clipboard.writeText(stored.markdown);
        }
        break;
      }
      case 'openLink':
        if (isSafeHref(message.href)) {
          await vscode.env.openExternal(vscode.Uri.parse(message.href));
        }
        break;
      case 'run':
        await vscode.commands.executeCommand(message.action === 'setup' ? 'sandboxAtlas.setupAi' : 'sandboxAtlas.customizeAppearance');
        break;
    }
  }

  private async handleInput(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text || this.busy) {
      return;
    }

    const input = parseChatInput(text);
    await this.add({ role: 'user', markdown: text, history: input.kind === 'ask' ? 'user' : undefined });

    if (input.kind === 'unknown-command') {
      await this.add({ role: 'notice', markdown: `Unknown command \`/${input.name}\`. Type \`/help\` to see what Atlas Chat can do.` });
      return;
    }
    if (input.kind === 'ask') {
      await this.ask(input.text);
      return;
    }

    switch (input.name) {
      case 'help':
        return void this.add({ role: 'notice', markdown: chatHelpMarkdown() });
      case 'clear':
        return this.onMessage({ type: 'clear' });
      case 'mode':
        return void vscode.commands.executeCommand('sandboxAtlas.customizeAppearance');
      case 'setup':
        return void vscode.commands.executeCommand('sandboxAtlas.setupAi');
      case 'graph':
        return this.openGraph(input.args);
      case 'scan':
        return this.scan();
      case 'map':
        return this.projectMap();
      default:
        return this.runFeature(input.name, input.args);
    }
  }

  // ── Conversation ──────────────────────────────────────────────────────────

  /** Free-form question with codebase context, streamed. */
  private async ask(question: string): Promise<void> {
    const root = await this.prepare(true);
    if (!root) {
      return;
    }
    const focus = this.attachedFile && rootForUri(vscode.Uri.file(this.attachedFile)) === root ? this.attachedFile : undefined;
    const history = this.historyBefore(1);

    await this.stream(async (onToken, signal) => {
      const request = buildChatRequest(this.session.engine.synthesizer, root, question, history,
        this.session.engine.aiConfig().contextTokenBudget, focus);
      const { completion } = await this.session.engine.chat(request, onToken, signal);
      return {
        markdown: completion.content,
        meta: `${completion.provider} · ${completion.totalTokens.toLocaleString('en-US')} tokens · context: ${request.contextLabel}`,
      };
    });
  }

  /** /trace, /impact, /plan, /docs — the dedicated AI features, streamed into the chat. */
  private async runFeature(name: string, args: string): Promise<void> {
    const root = await this.prepare(true);
    if (!root) {
      return;
    }
    const { synthesizer } = this.session.engine;
    const budget = this.session.engine.aiConfig().contextTokenBudget;

    let request: AiRequest;
    try {
      switch (name) {
        case 'trace':
          if (!args) {
            return void this.add({ role: 'notice', markdown: 'Usage: `/trace <feature>` — e.g. `/trace authentication`' });
          }
          request = buildTraceFeatureRequest(synthesizer, root, args, budget);
          break;
        case 'docs':
          request = buildSummarizeDocsRequest(synthesizer, root, budget);
          break;
        case 'impact': {
          const target = args ? await this.findFile(root, args) : this.attachedFile;
          if (!target) {
            return void this.add({ role: 'notice', markdown: 'Usage: `/impact <file>`, or attach a file (open it in the editor) and run `/impact`.' });
          }
          request = buildImpactAnalysisRequest(synthesizer, root, target, budget);
          break;
        }
        case 'plan':
          if (!this.attachedFile || !args) {
            return void this.add({ role: 'notice', markdown: 'Usage: open (attach) the file to change, then `/plan <what to change>`.' });
          }
          request = buildEditPlanRequest(synthesizer, root, this.attachedFile, args, budget);
          break;
        default:
          return;
      }
    } catch (error) {
      return void this.add({ role: 'notice', markdown: describeError(error), error: true });
    }

    await this.stream(async (onToken, signal) => {
      const result = await this.session.engine.runAi(request, signal, onToken);
      return {
        markdown: result.completion.content,
        meta: `${request.title} · ${result.completion.provider} · ${result.completion.totalTokens.toLocaleString('en-US')} tokens`,
      };
    }, request.title);
  }

  private async projectMap(): Promise<void> {
    const root = await this.prepare(false);
    if (root) {
      await this.add({ role: 'assistant', markdown: buildProjectMap(this.session.engine.store, root), meta: 'Project map · no AI used' });
    }
  }

  private async scan(): Promise<void> {
    const root = await resolveRoot();
    const result = root && await this.session.index(root);
    if (result) {
      await this.add({
        role: 'notice',
        markdown: `Indexed **${result.totalFiles}** files in ${result.durationMs} ms — ${result.filesReparsed} re-parsed, ${result.staleRecordsPurged} removed.`,
      });
    }
  }

  private async openGraph(args: string): Promise<void> {
    const root = await resolveRoot();
    const file = root && args ? await this.findFile(root, args) : undefined;
    await vscode.commands.executeCommand(file ? 'sandboxAtlas.showGraphForFile' : 'sandboxAtlas.showGraph', file ? vscode.Uri.file(file) : undefined);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Resolves and indexes the workspace root, and (for AI) makes sure a model can answer. */
  private async prepare(needsAi: boolean): Promise<string | undefined> {
    const root = await resolveRoot(this.attachedFile ? vscode.Uri.file(this.attachedFile) : undefined);
    if (!root || !await this.session.ensureIndexed(root)) {
      return undefined;
    }
    if (needsAi && !await ensureAiReady(this.session)) {
      await this.add({ role: 'notice', markdown: 'Atlas Chat needs an AI model for that. Run `/setup` to connect one. `/map`, `/graph` and `/scan` work without AI.' });
      return undefined;
    }
    this.postContext();
    return root;
  }

  /** Streams an answer into a new assistant message; handles stop, errors and persistence. */
  private async stream(
    produce: (onToken: (text: string) => void, signal: AbortSignal) => Promise<{ markdown: string; meta: string }>,
    title?: string,
  ): Promise<void> {
    const id = newId();
    this.abort = new AbortController();
    this.setBusy(true);
    this.post({ type: 'streamStart', id, title });

    let pending = '';
    let timer: NodeJS.Timeout | undefined;
    const flush = () => {
      timer = undefined;
      if (pending) {
        this.post({ type: 'streamDelta', id, text: pending });
        pending = '';
      }
    };
    const onToken = (text: string) => {
      pending += text;
      timer ??= setTimeout(flush, streamFlushMs);
    };

    let stored: StoredMessage;
    try {
      const answer = await produce(onToken, this.abort.signal);
      stored = { id, role: 'assistant', markdown: title ? `**${title}**\n\n${answer.markdown}` : answer.markdown, meta: answer.meta, history: 'assistant' };
      this.session.refreshViews();
    } catch (error) {
      const cancelled = error instanceof CancelledError;
      stored = {
        id,
        role: 'notice',
        markdown: cancelled ? '_Stopped._' : `${describeError(error)}\n\nRun \`/setup\` to check your AI provider.`,
        error: !cancelled,
      };
    } finally {
      clearTimeout(timer);
      this.abort = undefined;
      this.setBusy(false);
    }

    this.messages.push(stored);
    await this.persist();
    this.post({ type: 'streamEnd', message: await this.toView(stored) });
  }

  private async add(message: Omit<StoredMessage, 'id'>): Promise<void> {
    const stored = { ...message, id: newId() };
    this.messages.push(stored);
    await this.persist();
    this.post({ type: 'append', message: await this.toView(stored) });
  }

  /** Conversation turns for the model, excluding the last `skip` messages (the current question). */
  private historyBefore(skip: number): ChatTurn[] {
    return this.messages
      .slice(0, Math.max(0, this.messages.length - skip))
      .filter((message) => message.history)
      .map((message) => ({ role: message.history!, content: message.markdown }));
  }

  private async findFile(root: string, query: string): Promise<string | undefined> {
    const wanted = query.replace(/^[`'"]|[`'"]$/g, '').replace(/\\/g, '/').toLowerCase();
    const files = this.session.engine.store.listFiles(root);
    return (files.find((file) => file.relativePath.toLowerCase() === wanted)
      ?? files.find((file) => file.relativePath.toLowerCase().endsWith(`/${wanted}`))
      ?? files.find((file) => file.relativePath.toLowerCase().includes(wanted)))?.absolutePath;
  }

  private syncActiveEditor(): void {
    if (!this.followEditor) {
      return;
    }
    // With no file editor focused (e.g. typing in this chat), keep the last attached file.
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (uri && rootForUri(uri)) {
      this.attachedFile = uri.fsPath;
    }
  }

  private postContext(): void {
    const root = this.attachedFile ? rootForUri(vscode.Uri.file(this.attachedFile)) : undefined;
    const context: ChatContextView = {
      provider: this.session.engine.createProvider().displayName,
      attachedFile: this.attachedFile && root ? relativePosix(root, this.attachedFile) : undefined,
      followsEditor: this.followEditor,
    };
    this.post({ type: 'context', context });
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.post({ type: 'busy', busy });
  }

  private async toView(stored: StoredMessage): Promise<ChatMessageView> {
    return { id: stored.id, role: stored.role, html: await renderMarkdown(stored.markdown), meta: stored.meta, error: stored.error };
  }

  private async persist(): Promise<void> {
    this.messages = this.messages.slice(-maxStoredMessages);
    await this.workspaceState.update(transcriptKey, this.messages);
  }

  private post(message: HostToChatMessage): void {
    void this.view?.webview.postMessage(message);
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
