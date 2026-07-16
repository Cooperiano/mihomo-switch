import * as vscode from 'vscode';
import { writeFileSync } from 'fs';
import { TcpTransport, tcpAlive } from './transport';
import { readSecretCandidatesFromVerge } from './discovery';
import { readConfig } from './config';

/**
 * Opens the metacubexd dashboard, vendored locally, in a webview panel.
 *
 * metacubexd (the successor to yacd) reads backend config from a `config.js` file
 * in its own directory. We write that file with the discovered endpoint + secret
 * right before opening the webview, then frame the static files in an iframe —
 * same architecture as the old yacd integration but with a runtime-generated
 * config file instead of query parameters.
 *
 * Requires the TCP controller (mihomo's `-ext-ctl`): webview/iframe JS cannot
 * reach the Unix socket Clash Verge defaults to. mihomo's
 * `external-controller-cors` must allow the webview origin (or `*`).
 */
export async function openDashboard(ctx: vscode.ExtensionContext): Promise<void> {
  const tcp = await resolveTcpController();
  if (!tcp) {
    const choice = await vscode.window.showWarningMessage(
      'Mihomo: TCP controller not reachable. Enable External Controller (127.0.0.1:9097) in Clash Verge and fully restart it.',
      'Open Settings',
    );
    if (choice === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'mihomo-switch');
    }
    return;
  }

  const distDir = vscode.Uri.joinPath(ctx.extensionUri, 'resources', 'metacubexd');

  // Write a runtime config.js so metacubexd auto-connects — no manual setup.
  const backendUrl = buildBackendUrl(tcp.endpoint, tcp.secret);
  writeConfigJs(distDir, backendUrl);

  const panel = vscode.window.createWebviewPanel(
    'mihomo-dashboard',
    'Mihomo Dashboard',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [distDir],
    },
  );
  panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'resources', 'icon.svg');
  panel.webview.html = renderHtml(panel.webview, distDir);
}

/** Write `config.js` next to metacubexd's index.html. Works because VSCode
 *  unpacks extensions into a writable directory (~/.vscode/extensions/...). */
function writeConfigJs(distDir: vscode.Uri, backendUrl: string): void {
  const content = `window.__METACUBEXD_CONFIG__ = {
  defaultBackendURL: ${JSON.stringify(backendUrl)},
  githubToken: '',
};
`;
  writeFileSync(vscode.Uri.joinPath(distDir, 'config.js').fsPath, content, 'utf8');
}

function buildBackendUrl(endpoint: string, secret: string): string {
  const base = `http://${endpoint}`;
  return secret ? `${base}?secret=${encodeURIComponent(secret)}` : base;
}

/** Probe TCP endpoints + resolve a working secret. */
async function resolveTcpController(): Promise<{ endpoint: string; secret: string } | null> {
  const cfg = readConfig();
  const secrets: string[] = [];
  if (cfg.secret) {
    secrets.push(cfg.secret);
  }
  if (cfg.autoDiscover) {
    for (const s of await readSecretCandidatesFromVerge()) {
      secrets.push(s);
    }
  }
  secrets.push('');

  const endpoints: string[] = [];
  if (cfg.endpoint) {
    endpoints.push(cfg.endpoint);
  }
  if (cfg.autoDiscover) {
    for (const e of ['127.0.0.1:9097', '127.0.0.1:9090']) {
      if (!endpoints.includes(e)) endpoints.push(e);
    }
  }

  const dedup = <T>(arr: T[]): T[] => Array.from(new Set(arr));
  for (const ep of dedup(endpoints)) {
    if (!(await tcpAlive(ep))) {
      continue;
    }
    for (const secret of dedup(secrets)) {
      const t = new TcpTransport(ep, secret);
      try {
        await t.getProxies();
        t.dispose();
        return { endpoint: ep, secret };
      } catch {
        t.dispose();
      }
    }
  }
  return null;
}

function renderHtml(webview: vscode.Webview, distDir: vscode.Uri): string {
  const metacubexdIndex = webview.asWebviewUri(vscode.Uri.joinPath(distDir, 'index.html'));

  // CSP governs only the top document. The iframe runs under its own origin.
  const csp = `default-src 'none'; frame-src ${webview.cspSource}; style-src 'unsafe-inline';`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{margin:0;padding:0;height:100vh;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block}</style>
</head><body><iframe src="${metacubexdIndex}" title="Mihomo Dashboard"></iframe></body></html>`;
}
