// @ts-check
const esbuild = require('esbuild');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Reports build start/end so the VS Code problem matcher can track watch mode. */
/** @type {import('esbuild').Plugin} */
const problemMatcherPlugin = {
	name: 'esbuild-problem-matcher',
	setup(build) {
		build.onStart(() => console.log('[watch] build started'));
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					console.error(`    ${location.file}:${location.line}:${location.column}:`);
				}
			});
			console.log('[watch] build finished');
		});
	},
};

/** @type {import('esbuild').BuildOptions} */
const shared = {
	bundle: true,
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	logLevel: 'silent',
	metafile: true,
	plugins: [problemMatcherPlugin],
};

/** @type {import('esbuild').BuildOptions[]} */
const targets = [
	{
		// VS Code extension host. Everything except the VS Code API is bundled, so the VSIX ships
		// without node_modules; Node built-ins (including node:sqlite) come from VS Code's runtime.
		...shared,
		entryPoints: { extension: 'src/extension/extension.ts' },
		outdir: 'dist',
		platform: 'node',
		format: 'cjs',
		target: 'node22',
		external: ['vscode'],
	},
	{
		// Standalone CLI — the same engine without VS Code. Basis for a future single executable.
		...shared,
		entryPoints: { cli: 'src/cli/main.ts' },
		outdir: 'dist',
		platform: 'node',
		format: 'cjs',
		target: 'node22',
		banner: { js: '#!/usr/bin/env node' },
	},
	{
		// Graph webview (browser sandbox).
		...shared,
		entryPoints: ['src/webview/graph/graph.ts', 'src/webview/graph/graph.css'],
		outdir: 'dist/webview',
		platform: 'browser',
		format: 'iife',
		target: 'es2022',
		tsconfig: 'src/webview/tsconfig.json',
	},
];

async function main() {
	// Start from a clean output folder so stale bundles or source maps never get packaged.
	fs.rmSync('dist', { recursive: true, force: true });
	const contexts = await Promise.all(targets.map((options) => esbuild.context(options)));

	if (watch) {
		await Promise.all(contexts.map((context) => context.watch()));
		return;
	}

	for (const context of contexts) {
		const result = await context.rebuild();
		if (production && result.metafile) {
			Object.entries(result.metafile.outputs)
				.filter(([file]) => !file.endsWith('.map'))
				.forEach(([file, output]) => console.log(`${file.padEnd(28)} ${(output.bytes / 1024).toFixed(0).padStart(6)} KB`));
		}
		await context.dispose();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
