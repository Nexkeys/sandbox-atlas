/**
 * Incremental parser for OpenAI-compatible streaming responses (server-sent events).
 * Feed it raw text chunks as they arrive; it emits each `data:` payload and handles events
 * split across chunk boundaries.
 */
export class SseParser {
  private buffer = '';

  constructor(private readonly onData: (data: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    lines.forEach((line) => this.handleLine(line));
  }

  /** Processes a trailing line that arrived without a newline. */
  flush(): void {
    if (this.buffer) {
      this.handleLine(this.buffer);
      this.buffer = '';
    }
  }

  private handleLine(line: string): void {
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim();
      if (data && data !== '[DONE]') {
        this.onData(data);
      }
    }
  }
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}

/** Extracts the text delta (if any) and usage/model metadata from one streamed chunk. */
export function parseStreamChunk(data: string): { text: string; usage?: StreamChunk['usage']; model?: string } {
  try {
    const chunk = JSON.parse(data) as StreamChunk;
    return { text: chunk.choices?.[0]?.delta?.content ?? '', usage: chunk.usage, model: chunk.model };
  } catch {
    return { text: '' };
  }
}
