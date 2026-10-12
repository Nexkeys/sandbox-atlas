import type { AppearanceState } from '../../shared/appearance';
import { chatCommands } from '../../shared/chatCommands';
import type { ChatContextView, ChatMessageView, ChatToHostMessage, HostToChatMessage } from '../../shared/chatProtocol';
import { applyAppearance } from '../common/appearance';

interface VsCodeApi {
  postMessage(message: ChatToHostMessage): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();
const post = (message: ChatToHostMessage) => vscodeApi.postMessage(message);

const suggestions = [
  'Where is authentication handled?',
  'What are the main entry points of this project?',
  'What does the attached file do?',
  '/impact',
  '/map',
];

// Static shell; message HTML comes only from the host's escaping markdown renderer.
document.body.innerHTML = `
  <header class="chat-header">
    <div class="brand">
      <span class="logo" aria-hidden="true"></span>
      <span class="glow heading-case">Atlas Chat</span>
    </div>
    <div class="header-actions">
      <button id="provider" class="chip" title="Check or change the AI provider"></button>
      <button id="customize" class="icon-button" title="Customize appearance" aria-label="Customize appearance">Aa</button>
      <button id="clear" class="icon-button" title="New conversation" aria-label="New conversation">＋</button>
    </div>
  </header>
  <main id="messages" aria-live="polite"></main>
  <section id="welcome" class="welcome">
    <h2 class="glow">Ask your codebase anything</h2>
    <p class="muted">Answers use your local Atlas index. Type <code>/</code> for commands.</p>
    <div id="suggestions" class="suggestions"></div>
  </section>
  <footer class="composer surface">
    <div id="attachment" class="attachment"></div>
    <div id="commandMenu" class="command-menu surface" role="listbox" hidden></div>
    <div class="input-row">
      <textarea id="input" rows="1" placeholder="Ask about this codebase…  ( / for commands )" aria-label="Message"></textarea>
      <button id="send" class="primary" title="Send (Enter)">Send</button>
      <button id="stop" title="Stop generating" hidden>Stop</button>
    </div>
  </footer>
`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const messagesEl = element('messages');
const input = element<HTMLTextAreaElement>('input');
const sendButton = element<HTMLButtonElement>('send');
const stopButton = element<HTMLButtonElement>('stop');
const commandMenu = element('commandMenu');

let appearance: AppearanceState = { mode: 'classic', effects: true };
let messageCount = 0;
let busy = false;
let menuIndex = 0;
let menuItems: typeof chatCommands[number][] = [];
applyAppearance(appearance);

// ── Messages ────────────────────────────────────────────────────────────────

function renderMessage(message: ChatMessageView): HTMLElement {
  const wrapper = document.createElement('article');
  wrapper.className = `message ${message.role}${message.error ? ' error' : ''}`;
  wrapper.dataset.id = message.id;

  const body = document.createElement('div');
  body.className = 'body markdown';
  body.innerHTML = message.html;
  wrapper.append(body);

  if (message.role === 'assistant') {
    const footer = document.createElement('div');
    footer.className = 'message-footer';
    const meta = document.createElement('span');
    meta.className = 'meta muted';
    meta.textContent = message.meta ?? '';
    const copy = document.createElement('button');
    copy.className = 'icon-button small';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => {
      post({ type: 'copy', id: message.id });
      copy.textContent = 'Copied';
      setTimeout(() => {
        copy.textContent = 'Copy';
      }, 1200);
    });
    footer.append(meta, copy);
    wrapper.append(footer);
  } else if (message.meta) {
    const meta = document.createElement('div');
    meta.className = 'meta muted';
    meta.textContent = message.meta;
    wrapper.append(meta);
  }
  return wrapper;
}

function append(node: HTMLElement): void {
  messagesEl.append(node);
  messageCount += 1;
  updateWelcome();
  node.scrollIntoView({ block: 'end' });
}

function updateWelcome(): void {
  element('welcome').hidden = messageCount > 0;
}

function startStream(id: string, title?: string): void {
  const wrapper = document.createElement('article');
  wrapper.className = 'message assistant streaming';
  wrapper.dataset.id = id;
  if (title) {
    const heading = document.createElement('div');
    heading.className = 'stream-title';
    heading.textContent = title;
    wrapper.append(heading);
  }
  const body = document.createElement('div');
  body.className = 'body stream-text';
  const cursor = document.createElement('span');
  cursor.className = 'thinking';
  cursor.textContent = 'Thinking…';
  body.append(cursor);
  wrapper.append(body);
  append(wrapper);
}

function streamDelta(id: string, text: string): void {
  const body = messagesEl.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .stream-text`);
  if (!body) {
    return;
  }
  body.querySelector('.thinking')?.remove();
  body.append(document.createTextNode(text));
  body.parentElement?.scrollIntoView({ block: 'end' });
}

function endStream(message: ChatMessageView): void {
  const existing = messagesEl.querySelector(`[data-id="${CSS.escape(message.id)}"]`);
  const rendered = renderMessage(message);
  if (existing) {
    existing.replaceWith(rendered);
  } else {
    messagesEl.append(rendered);
    messageCount += 1;
  }
  rendered.scrollIntoView({ block: 'end' });
}

// ── Composer ────────────────────────────────────────────────────────────────

function send(text = input.value): void {
  if (!text.trim() || busy) {
    return;
  }
  post({ type: 'send', text });
  input.value = '';
  autosize();
  hideMenu();
}

function autosize(): void {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

function setBusy(value: boolean): void {
  busy = value;
  sendButton.hidden = value;
  stopButton.hidden = !value;
  input.placeholder = value ? 'Atlas is answering… (Stop to cancel)' : 'Ask about this codebase…  ( / for commands )';
}

function updateMenu(): void {
  const match = /^\/(\w*)$/.exec(input.value);
  if (!match) {
    hideMenu();
    return;
  }
  menuItems = chatCommands.filter((command) => command.name.startsWith(match[1].toLowerCase()));
  if (menuItems.length === 0) {
    hideMenu();
    return;
  }
  menuIndex = Math.min(menuIndex, menuItems.length - 1);
  commandMenu.replaceChildren(...menuItems.map((command, index) => {
    const item = document.createElement('div');
    item.className = `command-item${index === menuIndex ? ' active' : ''}`;
    item.setAttribute('role', 'option');
    const name = document.createElement('span');
    name.className = 'command-name';
    name.textContent = `/${command.name}${command.args ? ` ${command.args}` : ''}`;
    const description = document.createElement('span');
    description.className = 'muted';
    description.textContent = command.description;
    item.append(name, description);
    item.addEventListener('mousedown', (event) => {
      event.preventDefault();
      acceptCommand(index);
    });
    return item;
  }));
  commandMenu.hidden = false;
}

function hideMenu(): void {
  commandMenu.hidden = true;
  menuIndex = 0;
}

function acceptCommand(index: number): void {
  const command = menuItems[index];
  if (!command) {
    return;
  }
  if (command.args && !command.args.startsWith('[')) {
    input.value = `/${command.name} `;
    hideMenu();
    autosize();
  } else {
    send(`/${command.name}`);
  }
}

input.addEventListener('input', () => {
  autosize();
  updateMenu();
});

input.addEventListener('keydown', (event) => {
  if (!commandMenu.hidden) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      menuIndex = (menuIndex + (event.key === 'ArrowDown' ? 1 : menuItems.length - 1)) % menuItems.length;
      updateMenu();
      return;
    }
    if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
      event.preventDefault();
      acceptCommand(menuIndex);
      return;
    }
    if (event.key === 'Escape') {
      hideMenu();
      return;
    }
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    send();
  }
});

sendButton.addEventListener('click', () => send());
stopButton.addEventListener('click', () => post({ type: 'stop' }));
element('clear').addEventListener('click', () => post({ type: 'clear' }));
element('customize').addEventListener('click', () => post({ type: 'run', action: 'customize' }));
element('provider').addEventListener('click', () => post({ type: 'run', action: 'setup' }));

element('suggestions').replaceChildren(...suggestions.map((text) => {
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.textContent = text;
  chip.addEventListener('click', () => send(text));
  return chip;
}));

function renderContext(context: ChatContextView): void {
  element('provider').textContent = context.provider;
  const attachment = element('attachment');
  attachment.replaceChildren();
  if (context.attachedFile) {
    const chip = document.createElement('span');
    chip.className = 'chip attached';
    chip.title = context.followsEditor ? 'Follows the active editor' : 'Pinned file';
    const label = document.createElement('span');
    label.className = 'mono';
    label.textContent = `📎 ${context.attachedFile}`;
    const remove = document.createElement('button');
    remove.className = 'icon-button small';
    remove.setAttribute('aria-label', 'Detach file');
    remove.textContent = '✕';
    remove.addEventListener('click', () => post({ type: 'detach' }));
    chip.append(label, remove);
    attachment.append(chip);
  } else {
    const attach = document.createElement('button');
    attach.className = 'chip ghost';
    attach.textContent = '📎 Attach active file';
    attach.addEventListener('click', () => post({ type: 'attachActive' }));
    attachment.append(attach);
  }
}

// Links never navigate the webview; the host opens safe external URLs.
document.addEventListener('click', (event) => {
  const anchor = (event.target as HTMLElement).closest('a');
  if (anchor) {
    event.preventDefault();
    const href = anchor.getAttribute('href');
    if (href) {
      post({ type: 'openLink', href });
    }
  }
});

new MutationObserver(() => applyAppearance(appearance)).observe(document.body, { attributes: true, attributeFilter: ['class'] });

window.addEventListener('message', (event: MessageEvent<HostToChatMessage>) => {
  const message = event.data;
  switch (message?.type) {
    case 'appearance':
      appearance = message.appearance;
      applyAppearance(appearance);
      break;
    case 'transcript':
      messagesEl.replaceChildren();
      messageCount = 0;
      message.messages.forEach((item) => append(renderMessage(item)));
      updateWelcome();
      break;
    case 'append':
      append(renderMessage(message.message));
      break;
    case 'streamStart':
      startStream(message.id, message.title);
      break;
    case 'streamDelta':
      streamDelta(message.id, message.text);
      break;
    case 'streamEnd':
      endStream(message.message);
      break;
    case 'busy':
      setBusy(message.busy);
      break;
    case 'context':
      renderContext(message.context);
      break;
    case 'prefill':
      input.value = message.text;
      autosize();
      input.focus();
      break;
  }
});

updateWelcome();
input.focus();
post({ type: 'ready' });
