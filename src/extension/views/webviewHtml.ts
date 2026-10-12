import { randomBytes } from 'crypto';
import * as vscode from 'vscode';

/**
 * HTML shell for a Sandbox Atlas webview bundle (dist/webview/<name>.js + .css) under a strict
 * Content Security Policy: no inline scripts, no remote content, nonce-gated script.
 */
export function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, name: string, title: string): string {
  const nonce = randomBytes(16).toString('base64');
  const asset = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', file));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${asset(`${name}.css`)}">
  <title>${title}</title>
</head>
<body>
  <script nonce="${nonce}" src="${asset(`${name}.js`)}"></script>
</body>
</html>`;
}

export function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewPanelOptions & vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
  };
}
