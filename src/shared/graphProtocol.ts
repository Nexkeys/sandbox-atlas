import type { GraphData } from '../core/model';
import type { AppearanceState } from './appearance';

/** Messages between the graph webview and its host. Types only; shared by both sides. */

export type HostToGraphMessage =
  | { type: 'graph'; data: GraphData }
  | { type: 'appearance'; appearance: AppearanceState };

export type GraphToHostMessage =
  | { type: 'ready' }
  | { type: 'open'; path: string }
  | { type: 'focus'; path: string }
  | { type: 'showAll' }
  | { type: 'analyzeImpact'; path: string };
