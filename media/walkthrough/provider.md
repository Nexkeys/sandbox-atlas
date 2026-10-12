# Choose how Sandbox Atlas thinks

| Provider | Cost | Privacy | Setup |
| --- | --- | --- | --- |
| **Ollama** (default) | Free | Code never leaves your machine | Install [Ollama](https://ollama.com), then `ollama pull qwen2.5-coder:3b` |
| **LM Studio** | Free | Code never leaves your machine | Start the local server and load a chat model |
| **Gemini** | Free tier / paid | Sent to Google | API key from Google AI Studio |
| **OpenAI** | Paid | Sent to OpenAI | API key from platform.openai.com |
| **OpenRouter** | Paid, many models | Sent to OpenRouter | API key from openrouter.ai |

Indexing, the Atlas Map, the dependency graph and the project map **never** use AI. They work
without any provider.

API keys are stored encrypted in VS Code Secret Storage, never in `settings.json`. Online providers
are capped at 100 requests a day by default (`sandboxAtlas.ai.dailyRequestLimit`).
