import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/integration/**/*.test.js',
	workspaceFolder: './test-fixtures/sample',
	mocha: {
		ui: 'tdd',
		timeout: 60000,
	},
});
