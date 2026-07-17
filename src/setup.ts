import * as vscode from 'vscode';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { vergeConfigDir } from './discovery';

/**
 * Guided walkthrough for enabling mihomo's external controller.
 *
 * The node switcher and sidebar work over the Unix socket Clash Verge exposes
 * by default — no setup needed. The Dashboard (metacubexd webview) is the one
 * feature that requires the TCP controller (`external-controller: 127.0.0.1:9097`),
 * because webview/iframe JS cannot reach a Unix socket. This guide walks the
 * user through turning that on.
 */
export function openSetupGuide(): void {
  const panel = vscode.window.createWebviewPanel(
    'mihomo-setup',
    'Mihomo Switch · Setup',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: false },
  );
  panel.iconPath = vscode.Uri.joinPath(
    vscode.extensions.getExtension('cooperiano.mihomo-switch')!.extensionUri,
    'resources',
    'icon.svg',
  );

  panel.webview.html = renderHtml();

  panel.webview.onDidReceiveMessage(async (msg: string) => {
    switch (msg) {
      case 'openConfigFolder':
        await openConfigFolder();
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'mihomo-switch');
        break;
      case 'retry':
        panel.dispose();
        await vscode.commands.executeCommand('mihomo-switch.refresh');
        break;
      case 'openDashboard':
        panel.dispose();
        await vscode.commands.executeCommand('mihomo-switch.openDashboard');
        break;
    }
  });
}

/** Reveal the Clash Verge config dir in the OS file manager. */
async function openConfigFolder(): Promise<void> {
  const dir = vergeConfigDir();
  if (!existsSync(dir)) {
    const choice = await vscode.window.showWarningMessage(
      `Clash Verge config dir not found: ${dir}`,
      'Open Settings Instead',
    );
    if (choice === 'Open Settings Instead') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'mihomo-switch');
    }
    return;
  }
  const cmd =
    process.platform === 'win32'
      ? `explorer "${dir}"`
      : process.platform === 'darwin'
        ? `open "${dir}"`
        : `xdg-open "${dir}"`;
  exec(cmd, (err) => {
    if (err) {
      void vscode.window.showErrorMessage(`Could not open folder: ${err.message}`);
    }
  });
}

function renderHtml(): string {
  const dir = vergeConfigDir();
  // Inline-only static walkthrough — no external resources, no remote fetch.
  // 'unsafe-inline' covers both styles and the small nonce-less script.
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family, -apple-system, system-ui, sans-serif);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    max-width: 760px;
    margin: 0 auto;
    padding: 32px 24px 64px;
    line-height: 1.6;
  }
  h1 { font-size: 1.6em; margin: 0 0 4px; }
  h2 { font-size: 1.15em; margin: 28px 0 8px; color: var(--vscode-textLink-foreground); }
  .lead { color: var(--vscode-descriptionForeground); margin: 0 0 24px; }
  code, pre {
    font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
  }
  code { padding: 1px 5px; font-size: 0.9em; }
  pre { padding: 12px 14px; overflow-x: auto; font-size: 0.85em; line-height: 1.5; }
  .step { display: flex; gap: 14px; margin: 14px 0; }
  .num {
    flex: 0 0 26px; height: 26px; border-radius: 50%;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-weight: 600; font-size: 0.85em;
    display: flex; align-items: center; justify-content: center;
  }
  .step-body { flex: 1; }
  .path {
    display: inline-block; font-size: 0.82em; word-break: break-all;
    padding: 2px 6px; border-radius: 3px;
    background: var(--vscode-textBlockQuote-background);
  }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 28px 0 16px; }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; border-radius: 4px;
    padding: 8px 16px; font-size: 0.92em; cursor: pointer;
    font-family: inherit;
  }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button:hover { opacity: 0.9; }
  .note {
    border-left: 3px solid var(--vscode-textLink-foreground);
    padding: 6px 14px; margin: 16px 0;
    background: var(--vscode-textBlockQuote-background);
    border-radius: 0 4px 4px 0; font-size: 0.9em;
  }
</style>
</head>
<body>
  <h1>Enable the Mihomo Dashboard</h1>
  <p class="lead">Node switching and the sidebar work out of the box. The in-editor Dashboard needs mihomo's HTTP control port — follow these steps.</p>

  <div class="note">
    <strong>Why:</strong> Clash Verge runs mihomo with only a Unix socket for control. The Dashboard runs inside a webview, and webview JavaScript can't reach a Unix socket — it needs a real TCP port (<code>127.0.0.1:9097</code>).
  </div>

  <h2>Option A — Clash Verge Rev GUI (recommended)</h2>
  <div class="step"><div class="num">1</div><div class="step-body">Open <strong>Clash Verge Rev → Settings (设置)</strong>.</div></div>
  <div class="step"><div class="num">2</div><div class="step-body">Under <strong>Clash Setting</strong>, set <strong>External Controller</strong> to <code>127.0.0.1:9097</code> and note the <strong>Secret</strong>.</div></div>
  <div class="step"><div class="num">3</div><div class="step-body"><strong>Quit Clash Verge completely</strong> (menu bar → Quit, not just close the window) and relaunch it.</div></div>

  <h2>Option B — Edit the config file</h2>
  <p>Your Clash Verge config directory:</p>
  <p><span class="path">${escapeHtml(dir)}</span></p>
  <p>Add (or merge) these lines into your active profile / merge file, then fully restart Clash Verge:</p>
<pre>external-controller: 127.0.0.1:9097
secret: "your-secret-here"
external-controller-cors:
  allow-origins:
    - "*"</pre>

  <h2>Then</h2>
  <div class="step"><div class="num">✓</div><div class="step-body">Auto-discovery reads the secret from the Verge config automatically — you usually don't need to set it in VSCode.</div></div>
  <div class="step"><div class="num">✓</div><div class="step-body">If discovery still fails, set <code>mihomo-switch.endpoint</code> and <code>mihomo-switch.secret</code> manually.</div></div>

  <div class="actions">
    <button id="config">Open Config Folder</button>
    <button id="dashboard">Open Dashboard</button>
    <button id="settings" class="secondary">Open VSCode Settings</button>
    <button id="retry" class="secondary">Retry Discovery</button>
  </div>

  <script>
    const vscode = window.acquireVscodeApi ? window.acquireVsCodeApi() : null;
    const bind = (id, msg) => {
      const el = document.getElementById(id);
      if (el && vscode) el.onclick = () => vscode.postMessage(msg);
    };
    bind('config', 'openConfigFolder');
    bind('dashboard', 'openDashboard');
    bind('settings', 'openSettings');
    bind('retry', 'retry');
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
