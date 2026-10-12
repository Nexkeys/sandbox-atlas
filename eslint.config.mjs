import typescriptEslint from 'typescript-eslint';

/** Hosts other than the VS Code extension must stay free of the VS Code API. */
const noVscodeImport = {
  'no-restricted-imports': ['error', {
    paths: [{ name: 'vscode', message: 'Only src/extension (and its tests) may use the VS Code API. Use the ports in src/core/platform.ts.' }],
    patterns: [{ group: ['**/extension/**'], message: 'Lower layers must not depend on the VS Code extension layer.' }],
  }],
};

export default [
  {
    files: ['src/**/*.ts'],
    plugins: {
      '@typescript-eslint': typescriptEslint.plugin,
    },
    languageOptions: {
      parser: typescriptEslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/naming-convention': ['warn', { selector: 'import', format: ['camelCase', 'PascalCase'] }],
      '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'inline-type-imports' }],
      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      semi: 'warn',
    },
  },
  {
    // Architecture boundaries: core → (nothing), shared/webview/cli → core only.
    files: ['src/core/**/*.ts', 'src/shared/**/*.ts', 'src/webview/**/*.ts', 'src/cli/**/*.ts', 'src/test/unit/**/*.ts'],
    rules: noVscodeImport,
  },
];
