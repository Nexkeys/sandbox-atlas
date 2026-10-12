# Test the connection

**Sandbox Atlas: Test AI Connection** checks that your provider is reachable.

If it fails:

- **Ollama**: make sure the app is running (`ollama serve`) and the model is pulled
  (`ollama pull qwen2.5-coder:3b`). Custom port? Set `sandboxAtlas.ai.baseUrl`.
- **LM Studio**: open the *Developer* tab, start the server, and load a model.
- **Online providers**: run **Sandbox Atlas: Set AI API Key** and check the model name in
  `sandboxAtlas.ai.onlineModel`.

Slow machine? Raise `sandboxAtlas.ai.requestTimeoutSeconds`, or use a smaller model such as
`qwen2.5-coder:1.5b`. Details are in **Sandbox Atlas: Show Logs**.
