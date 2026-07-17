import * as vscode from 'vscode';
import { TcpTransport } from './transport';
import { resolveTcpController } from './discovery';
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
  const distDir = vscode.Uri.joinPath(ctx.extensionUri, 'resources', 'metacubexd');
  // Show the panel immediately with a loading state — probing the controller
  // can take up to ~1.5s per endpoint, and a blank window looks broken.
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
  panel.webview.html = renderLoading();

  const tcp = await resolveCachedTcpController(readConfig());
  if (!tcp) {
    panel.dispose();
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
  panel.webview.html = renderHtml(panel.webview, distDir, tcp.endpoint, tcp.secret);
}

/**
 * Cached controller resolution. Re-opening the dashboard hits the cache (a
 * single quick GET /proxies) instead of re-probing every endpoint. The cache
 * self-invalidates: if the cached secret goes stale the verify 401s and we
 * fall through to a full probe.
 */
const TCP_CACHE_TTL_MS = 60_000;
let cachedTcp: { endpoint: string; secret: string; at: number } | null = null;

async function resolveCachedTcpController(
  cfg: ReturnType<typeof readConfig>,
): Promise<{ endpoint: string; secret: string } | null> {
  if (cachedTcp && Date.now() - cachedTcp.at < TCP_CACHE_TTL_MS) {
    const t = new TcpTransport(cachedTcp.endpoint, cachedTcp.secret);
    try {
      await t.getProxies();
      t.dispose();
      return { endpoint: cachedTcp.endpoint, secret: cachedTcp.secret };
    } catch {
      t.dispose();
      cachedTcp = null;
    }
  }
  const resolved = await resolveTcpController(cfg);
  if (resolved) {
    cachedTcp = { ...resolved, at: Date.now() };
  }
  return resolved;
}

function renderLoading(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
  html,body{margin:0;height:100vh}
  body{display:flex;align-items:center;justify-content:center;gap:14px;
       background:var(--vscode-editor-background);color:var(--vscode-descriptionForeground);
       font-family:var(--vscode-font-family)}
  .spin{width:26px;height:26px;border-radius:50%;
        border:3px solid var(--vscode-button-secondaryBackground);
        border-top-color:var(--vscode-button-background);animation:r .8s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
</style></head>
<body><div class="spin"></div>连接 mihomo 控制器…</body></html>`;
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
