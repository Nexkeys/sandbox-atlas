/**
 * Atlas Chat slash commands. Pure data + parsing, shared by the chat webview (autocomplete),
 * the VS Code host and the CLI.
 */

export interface ChatCommandSpec {
  name: string;
  /** Argument hint shown in autocomplete, e.g. "<question>". */
  args?: string;
  description: string;
}

export const chatCommands: readonly ChatCommandSpec[] = [
  { name: 'trace', args: '<feature>', description: 'Find where a feature lives and where to start reading' },
  { name: 'impact', args: '[file]', description: 'What breaks if a file changes (default: attached/active file)' },
  { name: 'plan', args: '<change>', description: 'Step-by-step edit plan for the attached/active file' },
  { name: 'docs', description: 'Summarize the project documentation' },
  { name: 'map', description: 'Project map: hubs, entry points, folders (no AI)' },
  { name: 'scan', description: 'Re-index the workspace now' },
  { name: 'graph', args: '[file]', description: 'Open the dependency graph' },
  { name: 'mode', description: 'Change the look (8 modes)' },
  { name: 'setup', description: 'Check the AI provider and fix what is missing' },
  { name: 'clear', description: 'Start a new conversation' },
  { name: 'help', description: 'Show what Atlas Chat can do' },
];

export type ChatInput =
  | { kind: 'ask'; text: string }
  | { kind: 'command'; name: string; args: string }
  | { kind: 'unknown-command'; name: string };

export function parseChatInput(raw: string): ChatInput {
  const text = raw.trim();
  const match = /^\/(\w+)\s*([\s\S]*)$/.exec(text);
  if (!match) {
    return { kind: 'ask', text };
  }
  const name = match[1].toLowerCase();
  return chatCommands.some((command) => command.name === name)
    ? { kind: 'command', name, args: match[2].trim() }
    : { kind: 'unknown-command', name };
}

export function chatHelpMarkdown(): string {
  return [
    'Ask anything about this codebase in plain English, or use a command:',
    '',
    ...chatCommands.map((command) => `- \`/${command.name}${command.args ? ` ${command.args}` : ''}\` — ${command.description}`),
    '',
    'Answers use your local Atlas index as context. Attach the active file with the 📎 chip to focus on it.',
  ].join('\n');
}
