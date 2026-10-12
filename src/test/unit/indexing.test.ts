import * as assert from 'assert';
import * as fs from 'fs';
import { DependencyGraph } from '../../core';
import { isTestFile } from '../../core/graph/dependencyGraph';
import { createFixture, type Fixture } from './fixture';

suite('Indexing and dependency graph', () => {
  let fixture: Fixture;

  suiteSetup(async () => {
    fixture = createFixture();
    await fixture.engine.indexer.index(fixture.root);
  });

  suiteTeardown(() => fixture.dispose());

  test('scanner honours root and nested .gitignore, skips node_modules and minified files', () => {
    assert.deepStrictEqual(fixture.engine.store.listFiles(fixture.root).map((file) => file.relativePath), [
      'README.md',
      'packages/tool/keep.ts',
      'src/api/client.ts',
      'src/api/index.ts',
      'src/app.ts',
      'src/auth/login.ts',
      'src/components/LoginForm.tsx',
      'src/legacy.js',
    ]);
  });

  test('stores code and docs with forward-slash paths and reports stats', () => {
    const stats = fixture.engine.store.getStats(fixture.root);
    assert.strictEqual(stats.codeFiles, 7);
    assert.strictEqual(stats.docFiles, 1);
    assert.ok(stats.lastScanAt);
    assert.ok(fixture.engine.store.listCodeFiles(fixture.root).every((file) => !file.relativePath.includes('\\')));
  });

  test('graph resolves relative, barrel, @/ alias, .js→.ts, require and dynamic imports', () => {
    const graph = DependencyGraph.build(fixture.root, fixture.engine.store.listCodeFiles(fixture.root));
    const abs = fixture.abs;

    assert.deepStrictEqual(graph.dependentsOf(abs('src/api/client.ts')), [abs('src/api/index.ts'), abs('src/legacy.js')]);
    assert.deepStrictEqual(graph.dependentsOf(abs('src/auth/login.ts')), [abs('src/components/LoginForm.tsx'), abs('src/legacy.js')]);
    assert.deepStrictEqual(graph.dependenciesOf(abs('src/app.ts')), [abs('src/components/LoginForm.tsx')]);
    assert.deepStrictEqual(graph.entryPoints(5), [abs('src/legacy.js'), abs('src/app.ts')]);
    assert.ok(isTestFile(abs('src/test/unit/a.test.ts')) && isTestFile('/x/__tests__/b.js') && isTestFile('/x/c.spec.tsx'));
    assert.ok(!isTestFile(abs('src/latest.ts')) && !isTestFile('/x/contest/app.ts'));
  });

  test('file context lists direct and indirect dependents within the token budget', () => {
    const context = fixture.engine.synthesizer.synthesizeFileContext(fixture.root, fixture.abs('src/api/index.ts'), 'impact', 3000);
    assert.strictEqual(context.targetFound, true);
    assert.deepStrictEqual(context.directDependents, [fixture.abs('src/auth/login.ts')]);
    assert.deepStrictEqual(context.indirectDependents, [fixture.abs('src/components/LoginForm.tsx'), fixture.abs('src/legacy.js')]);
    assert.ok(context.prompt.includes('Resolved Dependency Map'));
    assert.ok(context.estimatedTokens <= context.tokenBudget);
  });

  test('ignored files are not indexed and never leak into prompts', () => {
    const context = fixture.engine.synthesizer.synthesizeFileContext(fixture.root, fixture.abs('ignored/secret.ts'), 'x', 3000);
    assert.strictEqual(context.targetFound, false);
    assert.ok(!context.prompt.includes('do-not-index'));
  });

  test('workspace context ranks keyword matches first', () => {
    const context = fixture.engine.synthesizer.synthesizeWorkspaceContext(fixture.root, 'login', 3000);
    const topTwo = context.includedBlocks.filter((block) => block.title.startsWith('Code Structure:')).slice(0, 2).map((block) => block.title).sort();
    assert.deepStrictEqual(topTwo, ['Code Structure: src/auth/login.ts', 'Code Structure: src/components/LoginForm.tsx']);
  });

  test('re-indexing skips unchanged files, re-parses edits and purges deletions', async () => {
    const unchanged = await fixture.engine.indexer.index(fixture.root);
    assert.strictEqual(unchanged.filesReparsed, 0);
    assert.strictEqual(unchanged.filesSkipped, 8);

    const future = new Date(Date.now() + 60_000);
    fs.writeFileSync(fixture.abs('src/app.ts'), 'export const app = 1;\n');
    fs.utimesSync(fixture.abs('src/app.ts'), future, future);
    fs.rmSync(fixture.abs('src/legacy.js'));

    const changed = await fixture.engine.indexer.index(fixture.root);
    assert.strictEqual(changed.filesReparsed, 1);
    assert.strictEqual(changed.staleRecordsPurged, 1);
    assert.strictEqual(changed.totalFiles, 7);
  });

  test('concurrent index requests share one run', async () => {
    const [first, second] = await Promise.all([fixture.engine.indexer.index(fixture.root), fixture.engine.indexer.index(fixture.root)]);
    assert.strictEqual(first, second);
  });

  test('includeIgnored indexes .gitignore matches but never node_modules', async () => {
    const result = await fixture.engine.indexer.index(fixture.root, { includeIgnored: true });
    const paths = fixture.engine.store.listFiles(fixture.root).map((file) => file.relativePath);
    assert.ok(paths.includes('ignored/secret.ts'));
    assert.ok(paths.includes('packages/tool/generated.ts'));
    assert.ok(!paths.some((item) => item.startsWith('node_modules')));
    assert.strictEqual(result.totalFiles, 9);
    await fixture.engine.indexer.index(fixture.root);
  });
});
