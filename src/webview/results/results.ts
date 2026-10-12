import type { AppearanceState } from '../../shared/appearance';
import type { HostToResultsMessage, ResultDocument, ResultsToHostMessage } from '../../shared/resultsProtocol';
import { applyAppearance } from '../common/appearance';

interface VsCodeApi {
  postMessage(message: ResultsToHostMessage): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();
const post = (message: ResultsToHostMessage) => vscodeApi.postMessage(message);

// Static shell; result HTML comes only from the host's escaping markdown renderer.
document.body.innerHTML = `
  <header class="header">
    <div class="heading">
      <span class="logo" aria-hidden="true"></span>
      <div>
        <h1 id="title" class="glow">Sandbox Atlas</h1>
        <div id="subtitle" class="muted"></div>
      </div>
    </div>
    <div class="actions">
      <button id="copy" title="Copy as Markdown">Copy</button>
      <button id="openMarkdown" title="Open the raw Markdown in an editor">Open as Markdown</button>
      <button id="save" class="primary" title="Save as a .md file">Save…</button>
    </div>
  </header>
  <main>
    <article id="content" class="surface markdown">
      <p class="muted">Waiting for a result…</p>
    </article>
  </main>
  <div id="toast" role="status" hidden>Copied</div>
`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let appearance: AppearanceState = { mode: 'classic', effects: true };
applyAppearance(appearance);

function render(result: ResultDocument): void {
  element('title').textContent = result.title;
  element('subtitle').textContent = result.subtitle ?? '';
  element('content').innerHTML = result.html;
  window.scrollTo({ top: 0 });
}

function showToast(text: string): void {
  const toast = element('toast');
  toast.textContent = text;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 1400);
}

element('copy').addEventListener('click', () => {
  post({ type: 'copy' });
  showToast('Copied to clipboard');
});
element('openMarkdown').addEventListener('click', () => post({ type: 'openMarkdown' }));
element('save').addEventListener('click', () => post({ type: 'save' }));

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

window.addEventListener('message', (event: MessageEvent<HostToResultsMessage>) => {
  const message = event.data;
  if (message?.type === 'result') {
    render(message.result);
  } else if (message?.type === 'appearance') {
    appearance = message.appearance;
    applyAppearance(appearance);
  }
});

post({ type: 'ready' });
