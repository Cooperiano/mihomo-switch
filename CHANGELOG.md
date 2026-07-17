# Changelog

## 0.4.0

Quality + UX pass.

- **Switch history**: Recently-switched nodes pin to the top of the QuickPick under a "最近使用" separator. Persisted across sessions via workspace state.
- **Optimistic switching**: Clicking a node highlights it instantly; reverts to the server's truth if the request fails.
- **Latency test progress**: The batch test now reports `done/total` as it runs, instead of an opaque spinner.
- **Dashboard opens faster**: Shows a loading state immediately instead of a blank window, and caches the controller for ~60s so re-opening the dashboard is near-instant (cache self-invalidates on auth failure).
- **De-dup + dead code**: Extracted the shared TCP-controller probe (`resolveTcpController`) that was duplicated between the dashboard and discovery. Removed unused `getVersion` and `MihomoInstance`.

## 0.3.2

- **Fix: Dashboard auto-connects now.** The metacubexd dashboard was stopping at the login screen (appeared blank/unusable) because the secret wasn't being injected — `config.js` only accepts `defaultBackendURL`, not a secret. Switched to metacubexd's native hash-fragment auto-login (`#/?hostname=&port=&secret=&http=1`), with `http=1` forcing the http scheme since mihomo's controller is plain HTTP. Verified end-to-end against a live backend.

## 0.3.1

- **Setup Guide**: New "Mihomo Switch: Setup External Controller" command opens a step-by-step walkthrough for enabling the TCP controller in Clash Verge (required only for the Dashboard; node switching works out of the box).
- **Smarter error states**: The "not found" status now distinguishes authentication failure from a missing instance and routes to the right fix (Setup Guide vs. settings).
- **Dashboard error guidance**: When the TCP controller is unreachable, the Dashboard prompt offers the Setup Guide directly instead of a generic settings link.
- **Open Config Folder**: The setup guide can reveal the detected Clash Verge config directory in Finder.

## 0.3.0

- **Dashboard upgrade**: Replaced vendored yacd (unmaintained since 2022) with metacubexd v1.269.0. Runtime config injection so the dashboard auto-connects — no manual setup.
- **Dashboard command**: Added "Mihomo Switch: Open Dashboard" to command palette (`alt+shift+d`).
- **Keyboard shortcuts**: `alt+shift+p` — switch proxy; `alt+shift+d` — open dashboard.
- **Exponential backoff**: Traffic WebSocket reconnection now uses exponential backoff (1s → 30s max) with jitter, replacing the fixed 3s retry.
- **Dependencies**: ws 8.21.0 → 8.21.1 (security patch), esbuild 0.20.2 → 0.28.1.

## 0.2.3

- Extension icon for marketplace.

## 0.2.2

- Add clash keywords to marketplace metadata.

## 0.2.1

- Add repository/bugs/homepage metadata.

## 0.2.0

- Publisher: Cooperiano.
- Slim VSIX (exclude node_modules).

## 0.1.0

- Initial release.
- Auto-discover local mihomo / Clash Verge instance (probe `9097` → `9090`, read secret from Verge config).
- Status bar: current exit node + live `/traffic` up/down.
- Two-level QuickPick switcher (group → node) with last-known latency.
- Activity-bar tree view; click a node to switch.
- Batch latency test against `GLOBAL` (or first group).
- Re-discovery on configuration change.
