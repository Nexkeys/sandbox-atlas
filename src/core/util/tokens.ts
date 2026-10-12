/** Rough token estimate (~4 characters per token) used for context budgeting. */
export function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / 4);
}
