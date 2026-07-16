import http from 'http';
import { existsSync } from 'fs';
import WebSocket from 'ws';
import type { DelayResponse, ProxiesResponse, TrafficSample } from './types';

/**
 * Uniform surface over mihomo's external controller, regardless of transport.
 *
 * mihomo exposes the controller over either TCP (`-ext-ctl host:port`) or a
 * Unix domain socket (`-ext-ctl-unix /path`). Clash Verge Rev ships mihomo
 * with the Unix socket only — no TCP port — so both must be supported.
 *
 * Docs: https://wiki.metacubex.one/api
 */
export interface Transport {
  getVersion(): Promise<{ version: string; meta?: boolean }>;
  getProxies(): Promise<ProxiesResponse>;
  selectProxy(group: string, name: string): Promise<void>;
  testDelay(name: string, testUrl: string, timeout: number): Promise<DelayResponse>;
  startTraffic(onSample: (s: TrafficSample) => void, onStatus?: (online: boolean) => void): void;
  dispose(): void;
}

const PROBE_TIMEOUT_MS = 1500;

function bearer(secret: string): Record<string, string> {
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

// --------------------------------------------------------------------------
// TCP transport — global fetch + `ws` WebSocket against /traffic
// --------------------------------------------------------------------------

export class TcpTransport implements Transport {
  private disposed = false;
  private trafficWs: WebSocket | null = null;
  private trafficReconnect: NodeJS.Timeout | null = null;
  private trafficReconnectAttempts = 0;
  private trafficCb?: (s: TrafficSample) => void;
  private trafficStatusCb?: (online: boolean) => void;

  constructor(
    private readonly endpoint: string, // `host:port`
    private readonly secret: string,
  ) {}

  private get httpBase(): string {
    return `http://${this.endpoint}`;
  }
  private get wsBase(): string {
    return `ws://${this.endpoint}`;
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.httpBase}${path}`, {
      ...init,
      headers: { ...bearer(this.secret), ...((init.headers as Record<string, string>) || {}) },
    });
    if (!res.ok) {
      throw new Error(`tcp ${init.method || 'GET'} ${path} -> ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  getVersion(): Promise<{ version: string; meta?: boolean }> {
    return this.req('/version');
  }
  getProxies(): Promise<ProxiesResponse> {
    return this.req('/proxies');
  }

  async selectProxy(group: string, name: string): Promise<void> {
    const res = await fetch(`${this.httpBase}/proxies/${encodeURIComponent(group)}`, {
      method: 'PUT',
      headers: { ...bearer(this.secret), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      throw new Error(`selectProxy ${group} -> ${res.status}`);
    }
  }

  testDelay(name: string, testUrl: string, timeout: number): Promise<DelayResponse> {
    const q = new URLSearchParams({ url: testUrl, timeout: String(timeout) });
    return this.req(`/proxies/${encodeURIComponent(name)}/delay?${q.toString()}`);
  }

  startTraffic(onSample: (s: TrafficSample) => void, onStatus?: (online: boolean) => void): void {
    if (this.disposed) return;
    this.trafficCb = onSample;
    this.trafficStatusCb = onStatus;
    this.connectTraffic();
  }

  private connectTraffic(): void {
    if (this.disposed) return;
    const secretQ = this.secret ? `?secret=${encodeURIComponent(this.secret)}` : '';
    const ws = new WebSocket(`${this.wsBase}/traffic${secretQ}`);
    this.trafficWs = ws;
    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const p = JSON.parse(data.toString()) as [number, number];
        if (Array.isArray(p) && p.length === 2) {
          this.trafficCb?.({ up: p[0], down: p[1] });
        }
      } catch {
        // ignore malformed frames
      }
    });
    ws.on('open', () => {
      this.trafficReconnectAttempts = 0;
      this.trafficStatusCb?.(true);
    });
    ws.on('error', () => {
      /* close handler follows */
    });
    ws.on('close', () => {
      this.trafficStatusCb?.(false);
      this.scheduleReconnect();
    });
  }

  /**
   * Exponential backoff: 1s → 2s → 4s → … → max 30s, with ±25% jitter.
   * Attempts reset on a successful `open` so brief blips don't escalate.
   */
  private scheduleReconnect(): void {
    if (this.disposed || this.trafficReconnect) return;
    const base = Math.min(1000 * 2 ** this.trafficReconnectAttempts, 30_000);
    const jitter = base * (0.5 + Math.random() * 0.5); // 50–100% of base
    this.trafficReconnectAttempts++;
    this.trafficReconnect = setTimeout(() => {
      this.trafficReconnect = null;
      this.connectTraffic();
    }, Math.round(jitter));
  }

  dispose(): void {
    this.disposed = true;
    if (this.trafficReconnect) clearTimeout(this.trafficReconnect);
    this.trafficWs?.close();
  }
}

// --------------------------------------------------------------------------
// Unix domain socket transport — Node `http` module over socketPath
// --------------------------------------------------------------------------

export class UnixSocketTransport implements Transport {
  private poll: NodeJS.Timeout | null = null;

  constructor(
    private readonly socketPath: string,
    private readonly secret: string,
  ) {}

  private request(path: string, method = 'GET', body?: string): Promise<{ status: number; data: string }> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { ...bearer(this.secret) };
      if (body) {
        headers['Content-Type'] = 'application/json';
      }
      const req = http.request(
        { socketPath: this.socketPath, path, method, headers, timeout: PROBE_TIMEOUT_MS },
        (res) => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c.toString()));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, data }));
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  private async getJson<T>(path: string): Promise<T> {
    const r = await this.request(path);
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`unix GET ${path} -> ${r.status}`);
    }
    return JSON.parse(r.data) as T;
  }

  getVersion(): Promise<{ version: string; meta?: boolean }> {
    return this.getJson('/version');
  }
  getProxies(): Promise<ProxiesResponse> {
    return this.getJson('/proxies');
  }

  async selectProxy(group: string, name: string): Promise<void> {
    const r = await this.request(`/proxies/${encodeURIComponent(group)}`, 'PUT', JSON.stringify({ name }));
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`selectProxy ${group} -> ${r.status}`);
    }
  }

  testDelay(name: string, testUrl: string, timeout: number): Promise<DelayResponse> {
    const q = new URLSearchParams({ url: testUrl, timeout: String(timeout) });
    return this.getJson(`/proxies/${encodeURIComponent(name)}/delay?${q.toString()}`);
  }

  /**
   * /traffic is WebSocket-only, and ws-over-unix-socket isn't supported by the
   * `ws` package. Poll /connections instead and derive a per-second rate from
   * the cumulative byte counters — a close approximation, fine for a status bar.
   */
  startTraffic(onSample: (s: TrafficSample) => void, onStatus?: (online: boolean) => void): void {
    let lastUp = -1;
    let lastDown = -1;
    const tick = async (): Promise<void> => {
      try {
        const r = await this.request('/connections');
        if (r.status < 200 || r.status >= 300) {
          onStatus?.(false);
          return;
        }
        const cur = JSON.parse(r.data) as { upload?: number; download?: number };
        const up = Number(cur.upload) || 0;
        const down = Number(cur.download) || 0;
        if (lastUp >= 0) {
          onSample({ up: Math.max(0, up - lastUp), down: Math.max(0, down - lastDown) });
        }
        lastUp = up;
        lastDown = down;
        onStatus?.(true);
      } catch {
        onStatus?.(false);
      }
    };
    void tick();
    this.poll = setInterval(tick, 1000);
  }

  dispose(): void {
    if (this.poll) {
      clearInterval(this.poll);
    }
    this.poll = null;
  }
}

// ---- liveness helpers (no resources held) ----

export async function tcpAlive(endpoint: string): Promise<boolean> {
  try {
    // Any HTTP response (even 401) means mihomo is listening. mihomo gates
    // /version behind the secret too, so checking res.ok would wrongly read
    // a 401 as "down" and skip the auth attempt entirely.
    await fetch(`http://${endpoint}/version`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

export function unixSocketAlive(socketPath: string): boolean {
  return existsSync(socketPath);
}
