# Contributing

## Setup

```bash
npm install
npm run build        # bundles dist/extension.js, dist/cli.js, dist/webview/*
```

Press **F5** in VS Code to launch an Extension Development Host. Watch mode runs automatically.

## Checks

| Command | What it does |
| --- | --- |
| `npm run verify` | Type-check (extension and webview), lint, unit tests |
| `npm run test:unit` | Fast engine tests in plain Node |
| `npm test` | Integration tests in a real VS Code (downloads it on first run) |
| `npm run package` | Builds `sandbox-atlas-<version>.vsix` |
| `npm run cli -- --help` | Runs the engine from the command line |

## Where code goes

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first.

- Logic that doesn't need UI goes in `src/core`, behind the `AtlasEngine` facade. It must never
  import `vscode`; lint will fail if it does.
- VS Code UI goes in `src/extension`: one file per command group or view.
- Browser code for webviews goes in `src/webview`. Insert workspace data with `textContent`,
  never `innerHTML`.

## Conventions

- TypeScript strict mode. Use `import type` for type-only imports.
- Errors thrown from `src/core` carry user-facing messages. Hosts decide how to show them.
- Add a unit test for engine changes and an integration test for new commands or views.
- Update `CHANGELOG.md` under **Unreleased**.
