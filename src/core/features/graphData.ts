import * as path from 'path';
import { DependencyGraph } from '../graph/dependencyGraph';
import type { GraphData, GraphEdge, GraphNode, GraphOptions } from '../model';
import type { AtlasStore } from '../storage/atlasStore';

/** Serializable dependency graph for visualisation (webview today, desktop app later). */
export function buildGraphData(store: AtlasStore, workspaceRoot: string, options: GraphOptions = {}): GraphData {
  const maxNodes = options.maxNodes ?? 1500;
  const code = store.listCodeFiles(workspaceRoot);
  const graph = DependencyGraph.build(workspaceRoot, code);
  const codeByPath = new Map(code.map((file) => [file.absolutePath, file]));

  let included: string[];
  if (options.focus && codeByPath.has(options.focus)) {
    included = neighbourhood(graph, options.focus, options.depth ?? 2);
  } else {
    // Without a focus, prefer connected files and the most connected first.
    included = code
      .map((file) => file.absolutePath)
      .sort((left, right) => degree(graph, right) - degree(graph, left) || left.localeCompare(right));
  }

  const truncated = included.length > maxNodes;
  const nodeIds = new Set(included.slice(0, maxNodes));

  const nodes: GraphNode[] = Array.from(nodeIds).map((id) => {
    const file = codeByPath.get(id)!;
    return {
      id,
      label: path.posix.basename(file.relativePath),
      relativePath: file.relativePath,
      group: groupOf(file.relativePath),
      kind: file.components.length > 0 ? 'component' : 'module',
      dependents: graph.dependentsOf(id).length,
      dependencies: graph.dependenciesOf(id).length,
      linesOfCode: file.linesOfCode,
      isFocus: id === options.focus,
    };
  });

  const edges: GraphEdge[] = [];
  nodeIds.forEach((source) => {
    graph.dependenciesOf(source).forEach((target) => {
      if (nodeIds.has(target)) {
        edges.push({ source, target });
      }
    });
  });

  return {
    workspaceName: path.basename(workspaceRoot),
    nodes,
    edges,
    totalFiles: code.length,
    truncated,
    focus: options.focus,
  };
}

/** Conventional source roots: colour by the folder inside them (src/components, src/api…). */
const sourceRoots = new Set(['src', 'app', 'lib', 'packages', 'apps', 'source']);

function groupOf(relativePath: string): string {
  const segments = relativePath.split('/');
  if (segments.length === 1) {
    return '(root)';
  }
  if (sourceRoots.has(segments[0]) && segments.length > 2) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0];
}

function degree(graph: DependencyGraph, file: string): number {
  return graph.dependentsOf(file).length + graph.dependenciesOf(file).length;
}

function neighbourhood(graph: DependencyGraph, focus: string, depth: number): string[] {
  const visited = new Set([focus]);
  let frontier = [focus];
  for (let hop = 0; hop < depth; hop += 1) {
    const next: string[] = [];
    frontier.forEach((file) => {
      [...graph.dependenciesOf(file), ...graph.dependentsOf(file)].forEach((neighbour) => {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          next.push(neighbour);
        }
      });
    });
    frontier = next;
  }
  return Array.from(visited);
}
