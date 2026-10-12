import type { AppearanceState } from './appearance';

/** A chat message as displayed. `html` comes from the host's safe markdown renderer. */
export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant' | 'notice';
  html: string;
  /** Small caption under the message, e.g. provider and tokens. */
  meta?: string;
  error?: boolean;
}

export interface ChatContextView {
  /** e.g. "Ollama (qwen2.5-coder:3b)". */
  provider: string;
  /** Workspace-relative path of the attached file, if any. */
  attachedFile?: string;
  /** True when the attachment follows the active editor. */
  followsEditor: boolean;
}

export type HostToChatMessage =
  | { type: 'appearance'; appearance: AppearanceState }
  | { type: 'transcript'; messages: ChatMessageView[] }
  | { type: 'append'; message: ChatMessageView }
  | { type: 'streamStart'; id: string; title?: string }
  | { type: 'streamDelta'; id: string; text: string }
  | { type: 'streamEnd'; message: ChatMessageView }
  | { type: 'busy'; busy: boolean }
  | { type: 'context'; context: ChatContextView }
  | { type: 'prefill'; text: string };

export type ChatToHostMessage =
  | { type: 'ready' }
  | { type: 'send'; text: string }
  | { type: 'stop' }
  | { type: 'clear' }
  | { type: 'detach' }
  | { type: 'attachActive' }
  | { type: 'copy'; id: string }
  | { type: 'openLink'; href: string }
  | { type: 'run'; action: 'setup' | 'customize' };
