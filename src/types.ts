/**
 * Shared types for Mihomo Switch.
 *
 * Shapes mirror the mihomo (Clash.Meta) external-controller REST API:
 * https://wiki.metacubex.one/api
 */

/** A single latency probe recorded against a proxy. */
export interface ProxyHistory {
  /** Round-trip in milliseconds. 0 means "not tested" or "timed out". */
  delay: number;
  /** ISO timestamp of the probe (optional, server-provided). */
  time?: string;
}

/** A mihomo proxy or proxy group as returned by `GET /proxies`. */
export interface Proxy {
  name: string;
  /**
   * mihomo proxy type. Group types we care about:
   *  - `Selector`  -> user-pickable, has `now` + `all`
   *  - `URLTest` / `Fallback` / `LoadBalance` -> auto groups, still have `now` + `all`
   * Outbound types: `Direct`, `Reject`, `Shadowsocks`, `Vmess`, `Trojan`, `Hysteria2`, ...
   */
  type: string;
  /** For groups: the currently selected outbound name. */
  now?: string;
  /** For groups: the list of member proxy names. */
  all?: string[];
  /** Most recent latency probes per outbound. */
  history?: ProxyHistory[];
  /** UDP support flag (informational). */
  udp?: boolean;
}

/** Response envelope of `GET /proxies`. */
export interface ProxiesResponse {
  proxies: Record<string, Proxy>;
}

/** Latency response from `GET /proxies/:name/delay`. */
export interface DelayResponse {
  delay: number;
}

/** A discovered / configured mihomo instance. empty `secret` = no auth. */
export interface MihomoInstance {
  /** `host:port`, e.g. `127.0.0.1:9097`. No scheme. */
  endpoint: string;
  /** Bearer secret. Empty string when the instance has no secret set. */
  secret: string;
}

/** One traffic sample pushed by `WS /traffic` as `[up, down]`. */
export interface TrafficSample {
  up: number;
  down: number;
}

/** A proxy group filtered down to the fields the UI needs. */
export interface ProxyGroupView {
  name: string;
  type: string;
  now: string;
  /** Member proxy names. */
  all: string[];
}

/** Plain object form of a QuickPick item (decoupled from vscode API for testing). */
export interface PlainQuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  picked: boolean;
  /** Stashed payload so the caller knows what was chosen. */
  proxyName?: string;
}
