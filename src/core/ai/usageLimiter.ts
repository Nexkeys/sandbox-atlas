import type { KeyValueStore } from '../platform';
import { isOnlineMode, type AiMode } from './aiConfig';

export interface DailyUsage {
  /** Local date, YYYY-MM-DD. */
  date: string;
  requests: number;
  tokens: number;
}

export class UsageLimitError extends Error {
  constructor(limit: number) {
    super(
      `Daily AI limit reached (${limit} online requests). It resets at midnight. `
      + 'Raise "sandboxAtlas.ai.dailyRequestLimit" (0 = unlimited) or switch to an offline mode.',
    );
    this.name = 'UsageLimitError';
  }
}

const storageKey = 'sandboxAtlas.usage';

/**
 * Tracks AI usage per local day and enforces a daily request cap for online (paid) providers.
 * Offline usage is recorded but never limited.
 */
export class UsageLimiter {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getToday(): DailyUsage {
    const today = localDate(this.now());
    const stored = this.store.get<DailyUsage>(storageKey);
    return stored?.date === today ? stored : { date: today, requests: 0, tokens: 0 };
  }

  /** Throws UsageLimitError when an online request would exceed `limit` (0 = unlimited). */
  assertWithinLimit(mode: AiMode, limit: number): void {
    if (isOnlineMode(mode) && limit > 0 && this.getToday().requests >= limit) {
      throw new UsageLimitError(limit);
    }
  }

  async record(tokens: number): Promise<DailyUsage> {
    const usage = this.getToday();
    const updated = { date: usage.date, requests: usage.requests + 1, tokens: usage.tokens + tokens };
    await this.store.update(storageKey, updated);
    return updated;
  }
}

function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
