import * as vscode from 'vscode';
import { TcpTransport, tcpAlive } from './transport';
import { readSecretCandidatesFromVerge } from './discovery';
import { readConfig } from './config';

/**
 * Opens the yacd-meta dashboard, vendored locally, in a webview panel.
 *
 * Injection strategy — lean on yacd's NATIVE config mechanism, no monkey-patch:
 * yacd reads `?hostname=&port=&secret=` from its own URL on startup. A webview's
 * top-level `location.search` is empty, but an <iframe src="...index.html?...">
 * gives yacd a real URL with those params, so it auto-connects. We just host
 * yacd's static files and frame them with the discovered endpoint in the query.
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

  const panel = vscode.window.createWebviewPanel(
    'mihomo-dashboard',
    'Mihomo Dashboard',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'resources', 'yacd')],
    },
  );
  panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'resources', 'icon.svg');
  panel.webview.html = renderHtml(panel.webview, ctx, tcp.endpoint, tcp.secret);
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

function renderHtml(
  webview: vscode.Webview,
  ctx: vscode.ExtensionContext,
  endpoint: string,
  secret: string,
): string {
  const distDir = vscode.Uri.joinPath(ctx.extensionUri, 'resources', 'yacd');
  const yacdIndex = webview.asWebviewUri(vscode.Uri.joinPath(distDir, 'index.html'));

  const idx = endpoint.lastIndexOf(':');
  const host = idx > 0 ? endpoint.slice(0, idx) : endpoint;
  const port = idx > 0 ? endpoint.slice(idx + 1) : '9090';
  const params = new URLSearchParams({ hostname: host, port });
  if (secret) {
    params.set('secret', secret);
  }

  // CSP governs only the top document. The iframe (yacd) runs under its own origin.
  const csp = `default-src 'none'; frame-src ${webview.cspSource}; style-src 'unsafe-inline';`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{margin:0;padding:0;height:100vh;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block}</style>
</head><body><iframe src="${yacdIndex}?${params.toString()}" title="Mihomo Dashboard"></iframe></body></html>`;
}
