import type { AppearanceState } from './appearance';

/** A rendered result (AI answer or project map). `html` is produced by the host's safe renderer. */
export interface ResultDocument {
  title: string;
  /** Short line under the title, e.g. provider and tokens. */
  subtitle?: string;
  html: string;
}

export type HostToResultsMessage =
  | { type: 'result'; result: ResultDocument }
  | { type: 'appearance'; appearance: AppearanceState };

export type ResultsToHostMessage =
  | { type: 'ready' }
  | { type: 'copy' }
  | { type: 'openMarkdown' }
  | { type: 'save' }
  | { type: 'openLink'; href: string };
