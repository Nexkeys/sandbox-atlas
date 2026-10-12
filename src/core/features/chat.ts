import type { AiChatMessage } from '../ai/aiProvider';
import { ATLAS_CHAT_SYSTEM_PROMPT } from '../ai/prompts';
import type { ContextSynthesizer } from '../context/contextSynthesizer';
import { relativePosix } from '../util/paths';
import { estimateTokens } from '../util/tokens';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: AiChatMessage[];
  /** Short description of the context used, for the UI. */
  contextLabel: string;
}

/** Share of the token budget reserved for conversation history; the rest is codebase context. */
const historyShare = 0.25;
/** Long earlier answers are clipped so history never crowds out the codebase context. */
const maxHistoryMessageChars = 1600;

/**
 * Builds a chat request: system prompt, recent history (within budget), and the user's
 * question with codebase context — centred on `focusFile` when one is attached.
 */
export function buildChatRequest(
  synthesizer: ContextSynthesizer,
  workspaceRoot: string,
  question: string,
  history: ChatTurn[],
  tokenBudget: number,
  focusFile?: string,
): ChatRequest {
  const contextBudget = Math.floor(tokenBudget * (1 - historyShare));
  const fileContext = focusFile
    ? synthesizer.synthesizeFileContext(workspaceRoot, focusFile, question, contextBudget)
    : undefined;
  const context = fileContext?.targetFound ? fileContext : synthesizer.synthesizeWorkspaceContext(workspaceRoot, question, contextBudget);

  const contextLabel = fileContext?.targetFound
    ? `${relativePosix(workspaceRoot, focusFile!)} + ${fileContext.directDependents.length} dependents`
    : `${context.includedBlocks.length} indexed sources`;

  return {
    messages: [
      { role: 'system', content: ATLAS_CHAT_SYSTEM_PROMPT },
      ...recentHistory(history, Math.floor(tokenBudget * historyShare)),
      { role: 'user', content: `${question}\n\n---\n\n${context.prompt}` },
    ],
    contextLabel,
  };
}

/** Most recent turns that fit `budget` tokens, oldest first, starting with a user turn. */
function recentHistory(history: ChatTurn[], budget: number): AiChatMessage[] {
  const selected: AiChatMessage[] = [];
  let used = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    const content = turn.content.length > maxHistoryMessageChars
      ? `${turn.content.slice(0, maxHistoryMessageChars)}\n[…earlier answer trimmed]`
      : turn.content;
    const tokens = estimateTokens(content.length);
    if (used + tokens > budget) {
      break;
    }
    selected.unshift({ role: turn.role, content });
    used += tokens;
  }
  while (selected.length > 0 && selected[0].role !== 'user') {
    selected.shift();
  }
  return selected;
}
