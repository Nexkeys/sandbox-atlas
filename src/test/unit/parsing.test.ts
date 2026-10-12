import * as assert from 'assert';
import { astParseFile } from '../../core/parsing/astParser';
import { docParseFile } from '../../core/parsing/docParser';

suite('Parsing', () => {
  test('detects React components, hooks and default exports', () => {
    const result = astParseFile('/x/LoginForm.tsx', [
      "import { useState } from 'react';",
      'export default function LoginForm() {',
      "  const [name] = useState('');",
      '  return <form>{name}</form>;',
      '}',
      'export const Badge = () => <span />;',
      'function helper() { return 1; }',
    ].join('\n'));

    assert.deepStrictEqual(result.components.map((component) => component.name).sort(), ['Badge', 'LoginForm']);
    assert.strictEqual(result.components.find((component) => component.name === 'LoginForm')?.usesHooks, true);
    assert.strictEqual(result.hasDefaultExport, true);
    assert.deepStrictEqual(result.functions.map((fn) => [fn.name, fn.isExported]), [['LoginForm', true], ['helper', false], ['Badge', true]]);
  });

  test('records explicit return types only (no type-checker inference)', () => {
    const result = astParseFile('/x/a.ts', 'export async function f(id: string): Promise<string> { return id; }\nexport function g() { return 1; }');
    assert.strictEqual(result.functions[0].returnType, 'Promise<string>');
    assert.strictEqual(result.functions[1].returnType, undefined);
  });

  test('dependencies include re-exports, require() and dynamic import()', () => {
    const result = astParseFile('/x/index.js', [
      "import a from './a';",
      "export { b } from './b';",
      "export * from './c';",
      "const d = require('./d');",
      "const e = () => import('./e');",
      'const notAModule = require(variable);',
    ].join('\n'));
    assert.deepStrictEqual(result.dependsOn, ['./a', './b', './c', './d', './e']);
  });

  test('never throws on invalid syntax', () => {
    const result = astParseFile('/x/broken.ts', 'export function ( {{{');
    assert.ok(Array.isArray(result.functions));
  });

  test('markdown sections and heuristic flags', async () => {
    const result = await docParseFile('/x/CHANGELOG.md', '# Project\n\n## Installation\n\nnpm install\n\n## Architecture\n\nData flow.\n');
    assert.deepStrictEqual(result.sections.map((section) => [section.level, section.title, section.lineStart]), [
      [1, 'Project', 1],
      [2, 'Installation', 3],
      [2, 'Architecture', 7],
    ]);
    assert.deepStrictEqual(result.flags, { hasSetupGuide: true, hasArchitectureNotes: true, hasChangelog: true });
  });
});
