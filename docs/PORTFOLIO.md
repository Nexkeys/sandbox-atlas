# Portfolio notes

Ready-to-use descriptions of Sandbox Atlas for a CV, LinkedIn or portfolio. These replace the
earlier notes, which named libraries the project no longer uses (ripgrep, better-sqlite3).

## One-liner

Built **Sandbox Atlas**, a TypeScript VS Code extension that indexes a codebase into a local SQLite
index, builds a resolved import graph, and uses offline or online LLMs to trace features, predict
the impact of a change, and produce reviewable edit plans.

## Bullet points

- Designed a **host-agnostic engine** (ports-and-adapters) shared by a VS Code extension and a
  Node CLI, with lint-enforced layer boundaries — the same core can power a future desktop app.
- Implemented **incremental indexing** with a pure-Node, `.gitignore`-aware scanner, `ts-morph` AST
  extraction (imports, re-exports, `require`/dynamic `import`, React components and hooks) and
  chunked SQLite transactions that keep the editor responsive.
- Built a **dependency graph** that resolves relative imports, barrels, `@/` aliases and
  TypeScript ESM `.js` specifiers, used for impact analysis (direct and second-level dependents),
  hub and entry-point detection.
- Wrote a **token-budgeted context synthesizer** that ranks code and docs by relevance and fits
  prompts to each provider's context window (e.g. Ollama's 4K default).
- Integrated **OpenAI-compatible providers** (Ollama, LM Studio, OpenAI, Gemini, OpenRouter) with
  cancellation, timeouts, encrypted API-key storage and a daily usage cap for paid providers.
- Shipped an **interactive dependency graph** (Cytoscape.js webview with strict CSP, themed from
  VS Code colour tokens), an Atlas Map tree view, onboarding walkthrough and auto-refresh.
- Replaced a native SQLite add-on that broke under VS Code's Electron ABI with Node's built-in
  `node:sqlite`, producing a single cross-platform VSIX with no native binaries.
- Set up unit and VS Code integration tests (mock LLM server) and a cross-platform GitHub Actions
  pipeline that packages and publishes to the VS Code Marketplace and Open VSX.

## Evidence

| What | Where |
| --- | --- |
| Engine facade and ports | `src/core/atlasEngine.ts`, `src/core/platform.ts` |
| Indexing | `src/core/indexing/` |
| Dependency graph | `src/core/graph/dependencyGraph.ts` |
| Context budgeting | `src/core/context/contextSynthesizer.ts` |
| AI providers and usage cap | `src/core/ai/` |
| VS Code layer | `src/extension/` |
| CLI host | `src/cli/main.ts` |
| Tests | `src/test/` |
