import type { GraphData } from '../core/model';

/** Messages between the graph webview and its host. Types only; shared by both sides. */

export type HostToGraphMessage =
  | { type: 'graph'; data: GraphData };

export type GraphToHostMessage =
  | { type: 'ready' }
  | { type: 'open'; path: string }
  | { type: 'focus'; path: string }
  | { type: 'showAll' }
  | { type: 'analyzeImpact'; path: string };
