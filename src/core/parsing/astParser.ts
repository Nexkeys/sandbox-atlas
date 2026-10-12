import {
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  Node,
  Project,
  type SourceFile,
  SyntaxKind,
  type VariableDeclaration,
} from 'ts-morph';
import type { ComponentData, ExportData, FunctionData, FunctionParameterData, ImportData } from '../model';

export interface AstParseResult {
  absolutePath: string;
  linesOfCode: number;
  imports: ImportData[];
  exports: ExportData[];
  functions: FunctionData[];
  components: ComponentData[];
  hasDefaultExport: boolean;
  dependsOn: string[];
  parseError?: string;
}

// In-memory file system: ts-morph never touches disk or resolves node_modules typings.
// Each file is parsed in isolation and removed afterwards so memory stays flat on large repos.
const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: {
    allowJs: true,
    checkJs: false,
    jsx: 4,
    skipLibCheck: true,
  },
  skipAddingFilesFromTsConfig: true,
});

function createEmptyAstResult(absolutePath: string, content = '', parseError?: string): AstParseResult {
  return {
    absolutePath,
    linesOfCode: countLinesOfCode(content),
    imports: [],
    exports: [],
    functions: [],
    components: [],
    hasDefaultExport: false,
    dependsOn: [],
    parseError,
  };
}

function countLinesOfCode(content: string): number {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .length;
}

function getLineStart(node: Node): number {
  return node.getSourceFile().getLineAndColumnAtPos(node.getStart()).line;
}

function getLineEnd(node: Node): number {
  return node.getSourceFile().getLineAndColumnAtPos(node.getEnd()).line;
}

function isCapitalizedIdentifier(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(name);
}

function isExportedNode(node: Node): boolean {
  return Node.isModifierable(node) && node.hasModifier(SyntaxKind.ExportKeyword);
}

function getFunctionParameters(node: FunctionDeclaration | FunctionExpression | ArrowFunction): FunctionParameterData[] {
  return node.getParameters().map((parameter) => {
    const typeText = parameter.getTypeNode()?.getText();

    return {
      name: parameter.getName(),
      type: typeText,
      isOptional: parameter.isOptional(),
    };
  });
}

// Only explicit annotations: inferring types would run the full type checker per function,
// which is very slow and mostly yields unresolved types for files parsed in isolation.
function getReturnTypeText(node: FunctionDeclaration | FunctionExpression | ArrowFunction): string | undefined {
  return node.getReturnTypeNode()?.getText();
}

function containsJsx(node: Node): boolean {
  if (
    Node.isJsxElement(node)
    || Node.isJsxSelfClosingElement(node)
    || Node.isJsxFragment(node)
  ) {
    return true;
  }

  return node.getDescendants().some((descendant) => (
    Node.isJsxElement(descendant)
    || Node.isJsxSelfClosingElement(descendant)
    || Node.isJsxFragment(descendant)
  ));
}

function callExpressionName(node: Node): string | undefined {
  if (!Node.isCallExpression(node)) {
    return undefined;
  }

  const expression = node.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }

  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }

  return undefined;
}

function containsReactHook(node: Node): boolean {
  return node.getDescendantsOfKind(SyntaxKind.CallExpression).some((callExpression) => {
    const name = callExpressionName(callExpression);
    return typeof name === 'string' && /^use[A-Z0-9]/.test(name);
  });
}

function expressionReturnsJsx(node: FunctionDeclaration | FunctionExpression | ArrowFunction): boolean {
  if (Node.isArrowFunction(node)) {
    const body = node.getBody();
    if (containsJsx(body)) {
      return true;
    }
  }

  return node.getDescendantsOfKind(SyntaxKind.ReturnStatement).some((returnStatement) => {
    const expression = returnStatement.getExpression();
    return typeof expression !== 'undefined' && containsJsx(expression);
  });
}

function buildFunctionData(
  name: string,
  node: FunctionDeclaration | FunctionExpression | ArrowFunction,
  declarationKind: FunctionData['declarationKind'],
  isExported: boolean,
): FunctionData {
  return {
    name,
    parameters: getFunctionParameters(node),
    isAsync: node.isAsync(),
    isExported,
    returnType: getReturnTypeText(node),
    lineStart: getLineStart(node),
    lineEnd: getLineEnd(node),
    declarationKind,
  };
}

function buildComponentData(
  name: string,
  node: FunctionDeclaration | FunctionExpression | ArrowFunction,
  declarationKind: ComponentData['declarationKind'],
): ComponentData | undefined {
  if (!isCapitalizedIdentifier(name)) {
    return undefined;
  }

  const returnsJsx = expressionReturnsJsx(node);
  const usesHooks = containsReactHook(node);

  if (!returnsJsx && !usesHooks) {
    return undefined;
  }

  return {
    name,
    declarationKind,
    usesHooks,
    returnsJsx,
    lineStart: getLineStart(node),
    lineEnd: getLineEnd(node),
  };
}

function extractImports(sourceFile: SourceFile): ImportData[] {
  return sourceFile.getImportDeclarations().map((importDeclaration) => {
    const importClause = importDeclaration.getImportClause();

    return {
      moduleSpecifier: importDeclaration.getModuleSpecifierValue(),
      defaultImport: importDeclaration.getDefaultImport()?.getText(),
      namespaceImport: importDeclaration.getNamespaceImport()?.getText(),
      namedImports: importDeclaration.getNamedImports().map((namedImport) => ({
        name: namedImport.getName(),
        alias: namedImport.getAliasNode()?.getText(),
      })),
      isTypeOnly: importClause?.isTypeOnly() ?? false,
    };
  });
}

function extractExports(sourceFile: SourceFile): ExportData[] {
  const exports: ExportData[] = [];

  sourceFile.getExportDeclarations().forEach((exportDeclaration) => {
    const moduleSpecifier = exportDeclaration.getModuleSpecifierValue();
    const namespaceExport = exportDeclaration.getNamespaceExport();

    if (namespaceExport) {
      exports.push({
        name: namespaceExport.getName(),
        type: 'namespace',
        moduleSpecifier,
        isTypeOnly: exportDeclaration.isTypeOnly(),
      });
    }

    exportDeclaration.getNamedExports().forEach((namedExport) => {
      exports.push({
        name: namedExport.getName(),
        alias: namedExport.getAliasNode()?.getText(),
        type: 'named',
        moduleSpecifier,
        isTypeOnly: exportDeclaration.isTypeOnly(),
      });
    });
  });

  sourceFile.getExportAssignments().forEach((exportAssignment) => {
    exports.push({
      name: exportAssignment.getExpression().getText(),
      type: exportAssignment.isExportEquals() ? 'named' : 'default',
      isTypeOnly: false,
    });
  });

  sourceFile.getExportedDeclarations().forEach((declarations, name) => {
    declarations.forEach((declaration) => {
      const isDefaultName = name === 'default';
      const exportedName = isDefaultName && Node.isFunctionDeclaration(declaration)
        ? declaration.getName() ?? 'default'
        : name;

      if (!exports.some((existing) => existing.name === exportedName && existing.type === (isDefaultName ? 'default' : 'named'))) {
        exports.push({
          name: exportedName,
          type: isDefaultName ? 'default' : 'named',
          isTypeOnly: false,
        });
      }
    });
  });

  return exports;
}

function variableDeclarationFunction(variableDeclaration: VariableDeclaration): {
  functionNode: ArrowFunction | FunctionExpression;
  declarationKind: 'arrow' | 'function-expression';
} | undefined {
  const initializer = variableDeclaration.getInitializer();
  if (typeof initializer === 'undefined') {
    return undefined;
  }

  if (Node.isArrowFunction(initializer)) {
    return {
      functionNode: initializer,
      declarationKind: 'arrow',
    };
  }

  if (Node.isFunctionExpression(initializer)) {
    return {
      functionNode: initializer,
      declarationKind: 'function-expression',
    };
  }

  return undefined;
}

function extractFunctionsAndComponents(sourceFile: SourceFile): {
  functions: FunctionData[];
  components: ComponentData[];
} {
  const functions: FunctionData[] = [];
  const components = new Map<string, ComponentData>();

  sourceFile.getFunctions().forEach((functionDeclaration) => {
    const name = functionDeclaration.getName();
    if (typeof name !== 'string') {
      return;
    }

    functions.push(buildFunctionData(name, functionDeclaration, 'function', isExportedNode(functionDeclaration)));
    const component = buildComponentData(name, functionDeclaration, 'function');
    if (component) {
      components.set(name, component);
    }
  });

  sourceFile.getVariableDeclarations().forEach((variableDeclaration) => {
    const name = variableDeclaration.getName();
    const functionInfo = variableDeclarationFunction(variableDeclaration);
    if (typeof functionInfo === 'undefined') {
      return;
    }

    const variableStatement = variableDeclaration.getFirstAncestorByKind(SyntaxKind.VariableStatement);
    const isExported = typeof variableStatement !== 'undefined' && isExportedNode(variableStatement);
    functions.push(buildFunctionData(name, functionInfo.functionNode, functionInfo.declarationKind, isExported));

    const component = buildComponentData(name, functionInfo.functionNode, functionInfo.declarationKind);
    if (component) {
      components.set(name, component);
    }
  });

  return {
    functions,
    components: Array.from(components.values()),
  };
}

/**
 * Every module this file depends on: static imports, re-exports (`export … from` — barrel
 * files), `require('…')` and dynamic `import('…')` with string-literal specifiers.
 */
function extractDependencies(sourceFile: SourceFile, imports: ImportData[], exports: ExportData[]): string[] {
  const specifiers = new Set<string>(imports.map((importData) => importData.moduleSpecifier));
  exports.forEach((exportData) => {
    if (exportData.moduleSpecifier) {
      specifiers.add(exportData.moduleSpecifier);
    }
  });
  sourceFile.getExportDeclarations().forEach((declaration) => {
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier) {
      specifiers.add(specifier);
    }
  });

  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
    const callee = call.getExpression();
    const isRequire = Node.isIdentifier(callee) && callee.getText() === 'require';
    const isDynamicImport = callee.getKind() === SyntaxKind.ImportKeyword;
    const [firstArgument] = call.getArguments();
    if ((isRequire || isDynamicImport) && firstArgument && Node.isStringLiteral(firstArgument)) {
      specifiers.add(firstArgument.getLiteralValue());
    }
  });

  return Array.from(specifiers).sort();
}

export function astParseFile(absolutePath: string, content: string): AstParseResult {
  let sourceFile: SourceFile | undefined;
  try {
    sourceFile = project.createSourceFile(absolutePath, content, { overwrite: true });
    const imports = extractImports(sourceFile);
    const exports = extractExports(sourceFile);
    const { functions, components } = extractFunctionsAndComponents(sourceFile);

    return {
      absolutePath,
      linesOfCode: countLinesOfCode(content),
      imports,
      exports,
      functions,
      components,
      hasDefaultExport: exports.some((exportData) => exportData.type === 'default'),
      dependsOn: extractDependencies(sourceFile, imports, exports),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createEmptyAstResult(absolutePath, content, message);
  } finally {
    if (sourceFile) {
      project.removeSourceFile(sourceFile);
    }
  }
}
