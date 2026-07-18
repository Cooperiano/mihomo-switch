import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { TcpTransport } from './transport';
import { resolveTcpController } from './discovery';
import { readConfig } from './config';

/**
 * Opens the metacubexd dashboard, vendored locally, in a webview panel.
 *
 * Architecture — metacubexd runs as the TOP-LEVEL webview document, not in an
 * iframe. An earlier iframe approach failed: VSCode serves vendored files from
 * a `file+.vscode-resource.vscode-cdn.net` host that is cross-origin to the
 * webview's top-level origin, and scripts inside that cross-origin iframe
 * silently don't execute → blank dashboard. Loading metacubexd at the top
 * level (where scripts provably run) fixes it.
 *
 * Two injections into metacubexd's index.html:
 *  1. `<base href="<webview-uri-of-distDir>/">` — rewrites metacubexd's
 *     relative `./_nuxt/…` and `./_fonts/…` references to same-origin webview
 *     URIs, so module scripts load under the webview origin (no CORS dance).
 *  2. A prefill script that seeds `localStorage` with the discovered endpoint
 *     (URL + secret) and selects it. metacubexd reads these via VueUse
 *     `useLocalStorage('endpointList')` / `('selectedEndpoint')` on mount, so
 *     it auto-connects without a login screen. The CSP opens
 *     `connect-src` to 127.0.0.1 for the HTTP API + WebSocket traffic stream.
 *
 * Requires the TCP controller (mihomo's `-ext-ctl`): webview JS cannot reach
 * the Unix socket Clash Verge defaults to.
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

/** Inject <base> + CSP + endpoint prefill into metacubexd's index.html. */
function renderHtml(
  webview: vscode.Webview,
  distDir: vscode.Uri,
  endpoint: string,
  secret: string,
): string {
  const indexHtml = readFileSync(vscode.Uri.joinPath(distDir, 'index.html').fsPath, 'utf8');
  const base = `${webview.asWebviewUri(distDir)}/`;
  const backend = `http://${endpoint}`;

  const csp = [
    `default-src 'none'`,
    // 'unsafe-inline' for metacubexd's inline NUXT_DATA + our prefill script;
    // cspSource for the vendored _nuxt module scripts.
    `script-src 'unsafe-inline' ${webview.cspSource}`,
    `style-src 'unsafe-inline' ${webview.cspSource}`,
    // mihomo controller HTTP API + WebSocket traffic stream.
    `connect-src http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* wss://127.0.0.1:*`,
    `img-src ${webview.cspSource} data: https:`,
    `font-src ${webview.cspSource}`,
    `manifest-src ${webview.cspSource}`,
    `worker-src ${webview.cspSource}`,
    `frame-src 'none'`,
  ].join('; ');

  const endpointId = 'vscode';
  const prefill = `<base href="${base}"><meta http-equiv="Content-Security-Policy" content="${csp}"><script>try{localStorage.setItem('endpointList',JSON.stringify([{id:${JSON.stringify(endpointId)},url:${JSON.stringify(backend)},secret:${JSON.stringify(secret)}}]));localStorage.setItem('selectedEndpoint',${JSON.stringify(endpointId)});}catch(e){}</script>`;

  return indexHtml.replace('<head>', '<head>' + prefill);
}
