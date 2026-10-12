import type { Marked, Tokens } from 'marked' with { 'resolution-mode': 'import' };

/**
 * Markdown → HTML for untrusted text (LLM output, repository docs). Raw HTML is escaped,
 * links are limited to http(s)/mailto, and images become their alt text (no remote loads).
 * Hosts should still render the result under a strict CSP and re-validate links before opening.
 */
let renderer: Promise<Marked> | undefined;

async function createRenderer(): Promise<Marked> {
  // marked is ESM-only; a dynamic import keeps this CommonJS module loadable everywhere.
  const { Marked: MarkedClass } = await import('marked');
  const instance = new MarkedClass({ gfm: true, breaks: false });

  instance.use({
    renderer: {
      html(token: Tokens.HTML | Tokens.Tag): string {
        return escapeHtml(token.text);
      },
      link(token: Tokens.Link): string {
        const label = this.parser.parseInline(token.tokens);
        return isSafeHref(token.href)
          ? `<a href="${escapeHtml(token.href)}" title="${escapeHtml(token.title ?? token.href)}">${label}</a>`
          : label;
      },
      image(token: Tokens.Image): string {
        return token.text ? `<em>[${escapeHtml(token.text)}]</em>` : '';
      },
    },
  });
  return instance;
}

export async function renderMarkdown(markdown: string): Promise<string> {
  renderer ??= createRenderer();
  return (await renderer).parse(markdown, { async: false });
}

/** True for links Sandbox Atlas may open externally. */
export function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
