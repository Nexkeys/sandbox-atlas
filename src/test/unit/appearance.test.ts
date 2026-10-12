import * as assert from 'assert';
import { atlasModeIds, atlasModes, iconSets, isAtlasModeId, resolveAppearance, type ModePalette } from '../../shared/appearance';
import { isSafeHref, renderMarkdown } from '../../core/util/markdown';

/** WCAG 2.x relative luminance contrast ratio between two #rrggbb colours. */
function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (light + 0.05) / (dark + 0.05);
}

function failures(palette: ModePalette): string[] {
  const problems: string[] = [];
  const check = (name: string, foreground: string, background: string, minimum: number) => {
    const ratio = contrast(foreground, background);
    if (ratio < minimum) {
      problems.push(`${name} ${foreground} on ${background} = ${ratio.toFixed(2)} (< ${minimum})`);
    }
  };

  // Text: WCAG AA 4.5:1 on every surface it appears on.
  for (const [surfaceName, surface] of [['background', palette.background], ['surface', palette.surface], ['surfaceAlt', palette.surfaceAlt]]) {
    check(`text/${surfaceName}`, palette.text, surface, 4.5);
    check(`muted/${surfaceName}`, palette.muted, surface, 4.5);
  }
  check('accentText/accent', palette.accentText, palette.accent, 4.5);
  // UI components and graphics: 3:1.
  check('accent/background', palette.accent, palette.background, 3);
  check('focus/background', palette.focus, palette.background, 3);
  palette.nodes.forEach((node, index) => check(`node[${index}]/background`, node, palette.background, 3));
  // Syntax (matching colour themes): code at 4.5:1, comments at 3:1.
  Object.entries(palette.syntax).forEach(([token, color]) => {
    check(`syntax.${token}/code`, color, palette.codeBackground, token === 'comment' ? 3 : 4.5);
  });
  return problems;
}

suite('Appearance modes', () => {
  test('fifteen modes with unique labels, fourteen matching colour themes', () => {
    assert.strictEqual(atlasModeIds.length, 15);
    assert.strictEqual(new Set(atlasModeIds.map((id) => atlasModes[id].label)).size, 15);
    const themed = atlasModeIds.filter((id) => atlasModes[id].colorTheme);
    assert.strictEqual(new Set(themed.map((id) => atlasModes[id].colorTheme)).size, 14);
    assert.ok(isAtlasModeId('cyberpunk') && !isAtlasModeId('nope'));
  });

  test('every mode names a valid icon set and shape', () => {
    atlasModeIds.forEach((id) => {
      assert.ok(atlasModes[id].iconSet in iconSets, `${id} icon set`);
      assert.ok(['rounded', 'pill', 'sharp', 'angular', 'pixel'].includes(atlasModes[id].shape), `${id} shape`);
    });
    Object.values(iconSets).forEach((set) => Object.entries(set).forEach(([slot, value]) => {
      assert.ok(slot === 'label' || typeof value === 'object' || /^[a-z0-9-]+$/.test(value), `${set.label}.${slot}`);
    }));
  });

  test('font and icon overrides win over the mode defaults', () => {
    const plain = resolveAppearance({ mode: 'arcade', effects: true });
    assert.match(plain.fonts.display, /Press Start 2P/);
    assert.strictEqual(plain.icons, iconSets.pixel);

    const custom = resolveAppearance({ mode: 'arcade', effects: true, uiFont: 'Inter', codeFont: 'Fira Code', iconSet: 'minimal' });
    assert.match(custom.fonts.ui, /^'Inter'/);
    assert.match(custom.fonts.display, /^'Inter'/);
    assert.match(custom.fonts.mono, /^'Fira Code'/);
    assert.strictEqual(custom.icons, iconSets.minimal);

    assert.strictEqual(resolveAppearance({ mode: 'retro', effects: true }).fontScale, 1.3);
    assert.strictEqual(resolveAppearance({ mode: 'classic', effects: true, uiFont: 'VT323' }).fontScale, 1.3);
    assert.match(resolveAppearance({ mode: 'retro', effects: true, uiFont: 'editor' }).fonts.ui, /--vscode-font-family/);
    assert.match(resolveAppearance({ mode: 'zen', effects: true, uiFont: 'Comic Sans' }).fonts.ui, /Inter/, 'unknown fonts fall back to the mode');
  });

  atlasModeIds.filter((id) => atlasModes[id].palette).forEach((id) => {
    test(`${atlasModes[id].label} palette meets WCAG contrast`, () => {
      const problems = failures(atlasModes[id].palette!);
      assert.deepStrictEqual(problems, []);
    });
  });
});

suite('Safe markdown rendering', () => {
  test('escapes raw HTML and scripts', async () => {
    const html = await renderMarkdown('Hi <img src=x onerror="alert(1)"> <script>alert(2)</script>');
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<script'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  test('keeps http links, strips javascript: links, and drops images', async () => {
    const html = await renderMarkdown('[ok](https://example.com) [bad](javascript:alert(1)) ![logo](https://x.y/z.png)');
    assert.ok(html.includes('<a href="https://example.com"'));
    assert.ok(!html.includes('javascript:'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('[logo]'));
  });

  test('renders GitHub-flavoured markdown', async () => {
    const html = await renderMarkdown('## Risks\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n- [ ] verify\n\n`code`');
    assert.match(html, /<h2>Risks<\/h2>/);
    assert.match(html, /<table>/);
    assert.match(html, /type="checkbox"/);
    assert.match(html, /<code>code<\/code>/);
  });

  test('link allowlist', () => {
    assert.ok(isSafeHref('https://a.b') && isSafeHref('mailto:x@y.z'));
    assert.ok(!isSafeHref('javascript:alert(1)') && !isSafeHref('file:///etc/passwd') && !isSafeHref('command:workbench.action.quit'));
  });
});
