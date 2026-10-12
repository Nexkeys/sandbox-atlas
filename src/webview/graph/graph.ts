import cytoscape, { type Core, type ElementDefinition, type LayoutOptions, type NodeSingular, type StylesheetJson } from 'cytoscape';
import type { GraphData, GraphNode } from '../../core/model';
import type { AppearanceState, AtlasMode } from '../../shared/appearance';
import type { GraphToHostMessage, HostToGraphMessage } from '../../shared/graphProtocol';
import { applyAppearance, nodeColors, token } from '../common/appearance';

interface VsCodeApi {
  postMessage(message: GraphToHostMessage): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();


// ── Static shell (no workspace data is ever inserted as HTML) ────────────────

document.body.innerHTML = `
  <header class="toolbar">
    <div class="title">
      <span class="logo" aria-hidden="true"></span>
      <span id="title" class="glow">Atlas Graph</span>
      <span id="stats" class="muted"></span>
    </div>
    <div class="controls">
      <input id="search" type="search" placeholder="Filter files…" aria-label="Filter files" spellcheck="false">
      <select id="layout" aria-label="Layout">
        <option value="cose">Force</option>
        <option value="breadthfirst">Hierarchy</option>
        <option value="concentric">Rings</option>
      </select>
      <button id="fit" title="Fit graph to view">Fit</button>
      <button id="showAll" class="primary" hidden>Show all files</button>
    </div>
  </header>
  <main id="graph" aria-label="Dependency graph"></main>
  <div id="legend" class="surface" aria-label="Folders"></div>
  <aside id="details" class="surface" hidden>
    <div id="detailsTitle" class="details-title"></div>
    <div id="detailsPath" class="muted mono"></div>
    <div id="detailsStats" class="details-stats"></div>
    <div class="details-actions">
      <button id="openFile" class="primary">Open</button>
      <button id="focusFile">Focus</button>
      <button id="impactFile">Analyze impact</button>
    </div>
  </aside>
  <div id="empty" class="empty" hidden></div>
`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const searchInput = element<HTMLInputElement>('search');
const layoutSelect = element<HTMLSelectElement>('layout');
const showAllButton = element<HTMLButtonElement>('showAll');
const details = element<HTMLElement>('details');
const empty = element<HTMLElement>('empty');

const glowNodeLimit = 300;

let cy: Core | undefined;
let current: GraphData | undefined;
let selected: GraphNode | undefined;
let appearance: AppearanceState = { mode: 'classic', effects: true };
let mode: AtlasMode = applyAppearance(appearance);
const groupColors = new Map<string, string>();

// ── Theme ────────────────────────────────────────────────────────────────────

function stylesheet(): StylesheetJson {
  const foreground = token('--atlas-text', '#cccccc');
  const edge = token('--atlas-edge', '#8b8b8b');
  const focus = token('--atlas-focus', '#007fd4');
  const background = token('--atlas-bg', '#1e1e1e');
  // Underlay glow is drawn per node and defeats Cytoscape's fast paths; keep it to smaller graphs.
  const glow = 'glow' in document.body.dataset && (current?.nodes.length ?? 0) <= glowNodeLimit;

  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        label: 'data(label)',
        color: foreground,
        'font-size': 11,
        'font-family': token('--atlas-font-ui', 'sans-serif'),
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'text-outline-color': background,
        'text-outline-width': 2,
        'min-zoomed-font-size': 7,
        width: 'data(size)',
        height: 'data(size)',
        'border-width': 0,
        'underlay-color': 'data(color)',
        'underlay-opacity': glow ? 0.35 : 0,
        'underlay-padding': glow ? 7 : 0,
        'underlay-shape': 'ellipse',
        'transition-property': 'opacity',
        'transition-duration': 150,
      },
    },
    { selector: 'node[kind = "component"]', style: { shape: 'round-rectangle', 'underlay-shape': 'round-rectangle' } },
    { selector: 'node[?isFocus]', style: { 'border-width': 3, 'border-color': focus } },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': focus } },
    {
      selector: 'edge',
      style: {
        width: 1.2,
        'line-color': edge,
        'target-arrow-color': edge,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
        opacity: 0.5,
      },
    },
    { selector: 'edge.highlighted', style: { 'line-color': focus, 'target-arrow-color': focus, opacity: 1, width: 2 } },
    { selector: '.faded', style: { opacity: 0.12 } },
  ];
}

/** Applies a mode and restyles the graph in place (no re-layout). */
function setAppearance(state: AppearanceState): void {
  appearance = state;
  mode = applyAppearance(state);
  groupColors.clear();
  cy?.nodes().forEach((node) => {
    node.data('color', colorFor(node.data('group') as string));
  });
  cy?.style(stylesheet());
  renderLegend();
}

// High-contrast theme switches change body classes; re-apply so HC always gets Classic.
new MutationObserver(() => setAppearance(appearance)).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// ── Rendering ────────────────────────────────────────────────────────────────

function colorFor(group: string): string {
  if (!groupColors.has(group)) {
    const palette = nodeColors(mode);
    groupColors.set(group, palette[groupColors.size % palette.length]);
  }
  return groupColors.get(group)!;
}

function toElements(data: GraphData): ElementDefinition[] {
  const nodes = data.nodes.map((node) => ({
    group: 'nodes' as const,
    data: {
      ...node,
      color: colorFor(node.group),
      size: Math.min(56, 16 + Math.sqrt(node.dependents) * 7),
    },
  }));
  const edges = data.edges.map((edge, index) => ({
    group: 'edges' as const,
    data: { id: `e${index}`, source: edge.source, target: edge.target },
  }));
  return [...nodes, ...edges];
}

function layoutOptions(name: string, nodeCount: number): LayoutOptions {
  switch (name) {
    case 'breadthfirst':
      return { name: 'breadthfirst', directed: true, spacingFactor: 1.1, animate: false } as LayoutOptions;
    case 'concentric':
      return {
        name: 'concentric',
        concentric: (node: NodeSingular) => node.data('dependents') as number,
        levelWidth: () => 2,
        animate: false,
      } as LayoutOptions;
    default:
      return {
        name: 'cose',
        animate: false,
        nodeRepulsion: () => 26000,
        idealEdgeLength: () => 95,
        nodeOverlap: 24,
        componentSpacing: 90,
        gravity: 0.6,
        numIter: nodeCount > 600 ? 400 : 1000,
        randomize: true,
      } as LayoutOptions;
  }
}

function runLayout(): void {
  if (cy && current) {
    cy.layout(layoutOptions(layoutSelect.value, current.nodes.length)).run();
    cy.fit(undefined, 40);
  }
}

function render(data: GraphData): void {
  current = data;
  groupColors.clear();
  selected = undefined;
  details.hidden = true;

  element('title').textContent = data.workspaceName;
  const edgeLabel = `${data.edges.length} import${data.edges.length === 1 ? '' : 's'}`;
  element('stats').textContent = data.truncated
    ? `${data.nodes.length} of ${data.totalFiles} files · ${edgeLabel}`
    : `${data.nodes.length} files · ${edgeLabel}`;
  showAllButton.hidden = !data.focus;
  if (data.focus) {
    layoutSelect.value = 'breadthfirst';
  }

  empty.hidden = data.nodes.length > 0;
  empty.textContent = 'No indexed code files yet. Run "Sandbox Atlas: Scan Workspace".';

  if (!cy) {
    cy = cytoscape({
      container: element('graph'),
      style: stylesheet(),
      minZoom: 0.05,
      maxZoom: 4,
      wheelSensitivity: 0.25,
    });
    cy.on('tap', 'node', (event) => select(event.target.data() as GraphNode));
    cy.on('tap', (event) => {
      if (event.target === cy) {
        select(undefined);
      }
    });
    cy.on('dbltap', 'node', (event) => post({ type: 'open', path: (event.target.data() as GraphNode).id }));
    cy.on('mouseover', 'node', (event) => highlightNeighbourhood(event.target as NodeSingular));
    cy.on('mouseout', 'node', () => applyFilter());
  }

  cy.elements().remove();
  cy.add(toElements(data));
  cy.style(stylesheet());
  runLayout();
  applyFilter();
  renderLegend();

  const focusNode = data.nodes.find((node) => node.isFocus);
  if (focusNode) {
    cy.getElementById(focusNode.id).select();
    select(focusNode);
  }
}

function renderLegend(): void {
  const legend = element('legend');
  legend.replaceChildren();
  Array.from(groupColors.entries()).slice(0, 10).forEach(([group, color]) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = color;
    item.append(swatch, document.createTextNode(group));
    legend.append(item);
  });
}

function select(node: GraphNode | undefined): void {
  selected = node;
  details.hidden = !node;
  if (!node) {
    return;
  }

  element('detailsTitle').textContent = node.label;
  element('detailsPath').textContent = node.relativePath;
  element('detailsStats').textContent =
    `Imported by ${node.dependents} · imports ${node.dependencies} · ${node.linesOfCode} lines${node.kind === 'component' ? ' · component' : ''}`;
  element<HTMLButtonElement>('focusFile').hidden = node.isFocus;
}

function highlightNeighbourhood(node: NodeSingular): void {
  if (!cy) {
    return;
  }
  const neighbourhood = node.closedNeighborhood();
  cy.elements().addClass('faded');
  neighbourhood.removeClass('faded');
  neighbourhood.edges().addClass('highlighted');
}

function applyFilter(): void {
  if (!cy) {
    return;
  }
  cy.elements().removeClass('faded highlighted');
  const term = searchInput.value.trim().toLowerCase();
  if (!term) {
    return;
  }
  const matches = cy.nodes().filter((node) => String(node.data('relativePath')).toLowerCase().includes(term));
  cy.elements().addClass('faded');
  matches.removeClass('faded');
}

function post(message: GraphToHostMessage): void {
  vscodeApi.postMessage(message);
}

// ── Wiring ───────────────────────────────────────────────────────────────────

searchInput.addEventListener('input', applyFilter);
layoutSelect.addEventListener('change', runLayout);
element('fit').addEventListener('click', () => cy?.fit(undefined, 40));
showAllButton.addEventListener('click', () => post({ type: 'showAll' }));
element('openFile').addEventListener('click', () => selected && post({ type: 'open', path: selected.id }));
element('focusFile').addEventListener('click', () => selected && post({ type: 'focus', path: selected.id }));
element('impactFile').addEventListener('click', () => selected && post({ type: 'analyzeImpact', path: selected.id }));

window.addEventListener('message', (event: MessageEvent<HostToGraphMessage>) => {
  const message = event.data;
  if (message?.type === 'graph') {
    render(message.data);
  } else if (message?.type === 'appearance') {
    setAppearance(message.appearance);
  }
});

post({ type: 'ready' });
