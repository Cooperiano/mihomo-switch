import * as vscode from 'vscode';
import { TcpTransport, tcpAlive } from './transport';
import { readSecretCandidatesFromVerge } from './discovery';
import { readConfig } from './config';

/**
 * Opens the metacubexd dashboard, vendored locally, in a webview panel.
 *
 * Auto-login via a hash fragment — metacubexd (hash-routed) reads these from
 * `route.query` on mount and connects automatically:
 *   index.html#/?hostname=&port=&secret=&http=1
 *   https://github.com/MetaCubeX/metacubexd/blob/main/pages/setup.vue
 *
 * Two gotchas, both verified against the live app:
 *  1. The params MUST be inside the `#` fragment. metacubexd reads them via
 *     object property access (`query.hostname`), which only works on
 *     vue-router's `route.query` — a bare `?…` in location.search is ignored.
 *  2. `http=1` forces the http: scheme. Without it metacubexd reuses the
 *     webview's protocol (https), but mihomo's controller is plain http, so
 *     the connection fails. localhost is a mixed-content exception in
 *     Chromium, so https-webview → http-127.0.0.1 still connects.
 *
 * Requires the TCP controller (mihomo's `-ext-ctl`): webview/iframe JS cannot
 * reach the Unix socket Clash Verge defaults to.
 */
export async function openDashboard(ctx: vscode.ExtensionContext): Promise<void> {
  const tcp = await resolveTcpController();
  if (!tcp) {
    const choice = await vscode.window.showWarningMessage(
      'Mihomo: Dashboard needs the TCP controller (127.0.0.1:9097). Open the setup guide to enable it in Clash Verge.',
      'Setup Guide',
      'Open Settings',
    );
    if (choice === 'Setup Guide') {
      await vscode.commands.executeCommand('mihomo-switch.setupController');
    } else if (choice === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'mihomo-switch');
    }
    return;
  }

  const distDir = vscode.Uri.joinPath(ctx.extensionUri, 'resources', 'metacubexd');

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
  panel.webview.html = renderHtml(panel.webview, distDir, tcp.endpoint, tcp.secret);
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

/**
 * Build the auto-login hash fragment metacubexd's setup page expects.
 *
 * metacubexd uses hash routing and reads these from `route.query`, so they
 * MUST live inside the `#` fragment — a bare `?…` in location.search is
 * ignored. `http=1` forces the http: scheme (see file header).
 */
function buildAutoLoginHash(endpoint: string, secret: string): string {
  const idx = endpoint.lastIndexOf(':');
  const hostname = idx > 0 ? endpoint.slice(0, idx) : endpoint;
  const port = idx > 0 ? endpoint.slice(idx + 1) : '9090';
  const params = new URLSearchParams({ hostname, port, http: '1' });
  if (secret) {
    params.set('secret', secret);
  }
  return `#/?${params.toString()}`;
}

function renderHtml(
  webview: vscode.Webview,
  distDir: vscode.Uri,
  endpoint: string,
  secret: string,
): string {
  const metacubexdIndex = webview.asWebviewUri(vscode.Uri.joinPath(distDir, 'index.html'));
  const hash = buildAutoLoginHash(endpoint, secret);

  // CSP governs only the top document. The iframe (metacubexd) runs under its
  // own origin and connects to 127.0.0.1 directly — a localhost mixed-content
  // exception, not gated by this CSP.
  const csp = `default-src 'none'; frame-src ${webview.cspSource}; style-src 'unsafe-inline';`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{margin:0;padding:0;height:100vh;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block}</style>
</head><body><iframe src="${metacubexdIndex}${hash}" title="Mihomo Dashboard"></iframe></body></html>`;
}
