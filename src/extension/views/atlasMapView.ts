import * as path from 'path';
import * as vscode from 'vscode';
import { DependencyGraph, type CodeFileRecord, type DocRecord, type FileRecord } from '../../core';
import type { AtlasSession } from '../atlasSession';
import { workspaceRoots } from '../host/workspaceRoots';

type MapNode = RootNode | FolderNode | FileNode | SymbolNode;

interface RootNode { kind: 'root'; root: string }
interface FolderNode { kind: 'folder'; root: string; relativePath: string }
interface FileNode { kind: 'file'; root: string; file: FileRecord }
interface SymbolNode {
  kind: 'symbol';
  file: FileRecord;
  label: string;
  detail?: string;
  line: number;
  icon: string;
  color?: string;
}

/** Everything the tree needs for one root, built once per index change. */
interface RootModel {
  children: Map<string, { folders: string[]; files: FileRecord[] }>;
  code: Map<string, CodeFileRecord>;
  docs: Map<string, DocRecord>;
  graph: DependencyGraph;
}

/**
 * "Atlas Map" sidebar: the indexed workspace as a folder tree. Files show importer/import
 * counts; expanding a file reveals its components, functions and doc sections.
 */
export class AtlasMapProvider implements vscode.TreeDataProvider<MapNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<MapNode | undefined>();
  private readonly models = new Map<string, RootModel>();
  private readonly subscription: vscode.Disposable;

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly session: AtlasSession) {
    this.subscription = session.onDidChange(() => {
      this.models.clear();
      this.changeEmitter.fire(undefined);
    });
  }

  getChildren(node?: MapNode): MapNode[] {
    const roots = workspaceRoots().filter((root) => this.session.engine.indexer.getStatus(root) !== 'idle');
    if (!node) {
      return roots.length === 1 ? this.folderChildren(roots[0], '') : roots.map((root) => ({ kind: 'root', root }));
    }

    switch (node.kind) {
      case 'root':
        return this.folderChildren(node.root, '');
      case 'folder':
        return this.folderChildren(node.root, node.relativePath);
      case 'file':
        return this.symbolChildren(node);
      default:
        return [];
    }
  }

  getTreeItem(node: MapNode): vscode.TreeItem {
    switch (node.kind) {
      case 'root': {
        const item = new vscode.TreeItem(path.basename(node.root), vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon('root-folder');
        item.description = `${this.session.engine.store.getStats(node.root).files} files`;
        return item;
      }
      case 'folder': {
        const item = new vscode.TreeItem(path.posix.basename(node.relativePath), vscode.TreeItemCollapsibleState.Collapsed);
        item.resourceUri = vscode.Uri.file(path.join(node.root, node.relativePath));
        item.iconPath = vscode.ThemeIcon.Folder;
        item.contextValue = 'atlasFolder';
        return item;
      }
      case 'file':
        return this.fileItem(node);
      case 'symbol': {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        item.description = node.detail;
        item.iconPath = new vscode.ThemeIcon(node.icon, node.color ? new vscode.ThemeColor(node.color) : undefined);
        item.command = openAtLine(node.file.absolutePath, node.line);
        item.tooltip = `${node.file.relativePath}:${node.line}`;
        return item;
      }
    }
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }

  private fileItem(node: FileNode): vscode.TreeItem {
    const model = this.model(node.root);
    const code = model.code.get(node.file.absolutePath);
    const doc = model.docs.get(node.file.absolutePath);
    const hasChildren = (code && (code.components.length > 0 || code.functions.length > 0)) || (doc && doc.sections.length > 0);

    const item = new vscode.TreeItem(
      path.posix.basename(node.file.relativePath),
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.resourceUri = vscode.Uri.file(node.file.absolutePath);
    item.command = { command: 'vscode.open', title: 'Open', arguments: [item.resourceUri] };

    if (code) {
      const dependents = model.graph.dependentsOf(code.absolutePath).length;
      const dependencies = model.graph.dependenciesOf(code.absolutePath).length;
      item.description = dependents || dependencies ? `←${dependents} →${dependencies}` : undefined;
      item.contextValue = 'atlasCodeFile';
      item.tooltip = new vscode.MarkdownString([
        `**${code.relativePath}**`,
        '',
        `${code.linesOfCode} lines · imported by ${dependents} · imports ${dependencies} local files`,
        code.components.length ? `\n\nComponents: ${code.components.map((c) => `\`${c.name}\``).join(', ')}` : '',
      ].join(''));
    } else {
      item.contextValue = 'atlasDocFile';
      item.tooltip = doc ? `${doc.relativePath} · ${doc.wordCount} words` : node.file.relativePath;
    }
    return item;
  }

  private folderChildren(root: string, relativeFolder: string): MapNode[] {
    const entry = this.model(root).children.get(relativeFolder);
    if (!entry) {
      return [];
    }
    return [
      ...entry.folders.map((folder): FolderNode => ({ kind: 'folder', root, relativePath: folder })),
      ...entry.files.map((file): FileNode => ({ kind: 'file', root, file })),
    ];
  }

  private symbolChildren(node: FileNode): SymbolNode[] {
    const model = this.model(node.root);
    const code = model.code.get(node.file.absolutePath);
    if (code) {
      const componentNames = new Set(code.components.map((component) => component.name));
      const components = code.components.map((component): SymbolNode => ({
        kind: 'symbol',
        file: node.file,
        label: component.name,
        detail: component.usesHooks ? 'component · hooks' : 'component',
        line: component.lineStart,
        icon: 'symbol-class',
        color: 'symbolIcon.classForeground',
      }));
      const functions = code.functions
        .filter((fn) => !componentNames.has(fn.name))
        .sort((left, right) => Number(right.isExported) - Number(left.isExported) || left.lineStart - right.lineStart)
        .map((fn): SymbolNode => ({
          kind: 'symbol',
          file: node.file,
          label: `${fn.name}()`,
          detail: [fn.isExported ? 'exported' : undefined, fn.isAsync ? 'async' : undefined].filter(Boolean).join(' · ') || undefined,
          line: fn.lineStart,
          icon: fn.isExported ? 'symbol-function' : 'symbol-method',
          color: fn.isExported ? 'symbolIcon.functionForeground' : undefined,
        }));
      return [...components, ...functions];
    }

    const doc = model.docs.get(node.file.absolutePath);
    return (doc?.sections ?? []).map((section): SymbolNode => ({
      kind: 'symbol',
      file: node.file,
      label: section.title,
      detail: `H${section.level}`,
      line: section.lineStart,
      icon: section.level === 1 ? 'symbol-namespace' : 'symbol-key',
    }));
  }

  private model(root: string): RootModel {
    const cached = this.models.get(root);
    if (cached) {
      return cached;
    }

    const store = this.session.engine.store;
    const codeFiles = store.listCodeFiles(root);
    const children = new Map<string, { folders: string[]; files: FileRecord[] }>();
    const ensureFolder = (folder: string) => {
      if (!children.has(folder)) {
        children.set(folder, { folders: [], files: [] });
        if (folder !== '') {
          const parent = path.posix.dirname(folder) === '.' ? '' : path.posix.dirname(folder);
          ensureFolder(parent).folders.push(folder);
        }
      }
      return children.get(folder)!;
    };

    ensureFolder('');
    store.listFiles(root).forEach((file) => {
      const folder = path.posix.dirname(file.relativePath);
      ensureFolder(folder === '.' ? '' : folder).files.push(file);
    });
    children.forEach((entry) => entry.folders.sort((left, right) => left.localeCompare(right)));

    const model: RootModel = {
      children,
      code: new Map(codeFiles.map((file) => [file.absolutePath, file])),
      docs: new Map(store.listDocs(root).map((doc) => [doc.absolutePath, doc])),
      graph: DependencyGraph.build(root, codeFiles),
    };
    this.models.set(root, model);
    return model;
  }
}

function openAtLine(absolutePath: string, line: number): vscode.Command {
  const position = new vscode.Position(Math.max(0, line - 1), 0);
  return {
    command: 'vscode.open',
    title: 'Open',
    arguments: [vscode.Uri.file(absolutePath), { selection: new vscode.Range(position, position) }],
  };
}
