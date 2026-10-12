# Changelog

All notable changes to Sandbox Atlas are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-10-12

First public release.

### Added
- **Guided AI setup**: before an AI command runs, Sandbox Atlas checks the provider and fixes the
  problem in place:
  - No local model: set up Ollama, or use a free-tier Gemini key.
  - Model not downloaded: download it, or pick an installed one.
  - Missing or rejected key: enter a new one.
  - Also available as **Set Up AI**, with the same guidance in the CLI.
- **8 appearance modes**: Classic, Vibe Coder, Hacker, Soft, Midnight, Sunset, Blueprint and Zen.
  - **Select Mode** previews each mode live in open Atlas panels.
  - Visual effects (glow, scanlines, grid) honour reduced motion and high contrast.
  - Every palette is unit-tested for WCAG AA contrast.
- **7 matching VS Code colour themes**, generated from the same mode definitions. Applying one is
  opt-in (`sandboxAtlas.appearance.applyColorTheme`), and Classic restores your previous theme.
- **Atlas Results** panel: themed AI answers and project maps with Copy, Open as Markdown and
  Save. Untrusted markdown is rendered with raw HTML escaped and links allow-listed.
- **Atlas Map** sidebar: indexed files with importer/import counts. Expand a file to see its
  components, hooks and functions; click to jump to the line.
- **Overview** panel: index health, AI provider, today's usage and quick actions.
- **Interactive dependency graph** (Cytoscape.js webview):
  - force, hierarchy and ring layouts
  - filter, focus mode and neighbourhood highlighting
  - "Analyze impact" from any node
- **Generate Project Map** and **Export Atlas Notes (`ATLAS.md`)**: an AI-free map with stats,
  hubs, entry points, docs and a per-folder listing.
- **Daily usage cap** for online AI providers (`sandboxAtlas.ai.dailyRequestLimit`).
- **Select AI Provider** and **Test AI Connection** commands, plus a getting-started walkthrough.
- Auto-refresh on file changes (`sandboxAtlas.index.autoRefresh`).
- Multi-root workspace support.
- **Toggle Ignored Files (This Session)**, which asks for confirmation first.
- Explorer and editor context-menu submenu for file commands.
- `atlas` command-line interface running the same engine (`dist/cli.js`).
- Unit tests (engine) and VS Code integration tests; CI on Windows, macOS and Linux; release
  workflow publishing to the VS Code Marketplace and Open VSX.

### Changed
- Restructured into a host-agnostic engine (`src/core`) with thin hosts (`src/extension`,
  `src/cli`). Lint rules enforce that the engine never imports the VS Code API.
- Dependency graph now counts re-exports (barrel files), `require()` and dynamic `import()`.
- Impact Analysis and Edit Plans use resolved direct and second-level dependents.
- Local-model prompts fit Ollama's default 4K context window, so instructions are no longer
  truncated.
- The AI timeout is automatic: 300 s for local models, 120 s for online.
- Minimum VS Code is now 1.101 (was 1.120), so Cursor and Windsurf can install it.
- The index database is versioned and rebuilt automatically when the schema changes.

### Fixed
- The extension failed to activate: `better-sqlite3` was built for Node's ABI, not VS Code's
  Electron ABI. Storage now uses the built-in `node:sqlite`.
- A packaged VSIX would crash because its dependencies were left out. All dependencies are now
  bundled.
- Windows paths broke file-targeted features.
- Search ranking favoured large unrelated files.
- Concurrent indexing runs, duplicate error popups, and AI requests that could hang with no way
  to cancel.

### Security
- Removed a hard-coded API key from the source. Keys now live in VS Code Secret Storage.
- The VSIX contents are an allowlist, so `.env` and other local files can never be packaged.
- In untrusted workspaces, workspace-level AI endpoint and mode settings are ignored.
- The graph webview runs under a strict Content Security Policy, and workspace data is never
  inserted as HTML.
