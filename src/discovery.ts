import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { MihomoConfig } from './config';
import type { Transport } from './transport';
import { TcpTransport, UnixSocketTransport, tcpAlive, unixSocketAlive } from './transport';

/**
 * Instance discovery. Resolves a working Transport (TCP or Unix socket) plus
 * the secret that authenticates against the local mihomo.
 *
 * Reality of Clash Verge Rev (verified against a live install):
 *  - verge-mihomo is started with `-ext-ctl-unix /tmp/verge/verge-mihomo.sock`
 *    and NO `-ext-ctl`, so there is **no TCP controller** by default.
 *  - The Unix socket is therefore the primary path; TCP is a fallback for
 *    users who run mihomo directly or enable Verge's external controller.
 *  - The `secret` is written to the merged mihomo config file(s); `verge.yaml`
 *    (GUI settings) has no controller/secret fields at all.
 */

/** Unix sockets Verge/mihomo may expose, most-trusted first. */
const VERGE_SOCKETS = ['/tmp/verge/verge-mihomo.sock'];

/** TCP endpoints to probe after the socket path. */
const TCP_ENDPOINTS = ['127.0.0.1:9097', '127.0.0.1:9090'];

const VERGE_APP_ID = 'io.github.clash-verge-rev.clash-verge-rev';

/** Files Verge may write the running secret to, newest/most-trusted first. */
const SECRET_FILES = ['clash-verge.yaml', 'config.yaml'];

/** Clash Verge Rev config dir, per-OS. Exported for testing the path logic. */
export function vergeConfigDir(): string {
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', VERGE_APP_ID);
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), VERGE_APP_ID);
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), VERGE_APP_ID);
  }
}

/** Pull the `secret` field out of a mihomo yaml doc. Pure — testable, no FS. */
export function parseSecretFromYaml(content: string): string | undefined {
  let doc: unknown;
  try {
    doc = yaml.load(content);
  } catch {
    return undefined;
  }
  if (!doc || typeof doc !== 'object') return undefined;
  const secret = (doc as Record<string, unknown>)['secret'];
  return typeof secret === 'string' && secret.length > 0 ? secret : undefined;
}

export async function readSecretCandidatesFromVerge(): Promise<string[]> {
  const dir = vergeConfigDir();
  const out: string[] = [];
  for (const f of SECRET_FILES) {
    try {
      const content = await fs.readFile(path.join(dir, f), 'utf8');
      const secret = parseSecretFromYaml(content);
      if (secret && !out.includes(secret)) out.push(secret);
    } catch {
      // missing or unreadable file — try the next
    }
  }
  return out;
}

/** Build the secret candidate list: manual > Verge config files > none. De-duped. */
async function resolveSecrets(cfg: MihomoConfig): Promise<string[]> {
  const raw: (string | undefined)[] = [];
  if (cfg.secret) raw.push(cfg.secret);
  if (cfg.autoDiscover) {
    for (const s of await readSecretCandidatesFromVerge()) raw.push(s);
  }
  raw.push(''); // try unauthenticated last
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of raw) {
    const k = c ?? '';
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/** Confirm a transport works end-to-end (auth included) via GET /proxies. */
async function probe(transport: Transport): Promise<boolean> {
  try {
    await transport.getProxies();
    return true;
  } catch {
    transport.dispose();
    return false;
  }
}

export interface DiscoveryResult {
  transport: Transport | null;
  /** Human-readable status, surfaced in the status bar tooltip. */
  note: string;
}

/** Resolve a working transport for the local mihomo, or report why it failed. */
export async function discoverInstance(cfg: MihomoConfig): Promise<DiscoveryResult> {
  const secrets = await resolveSecrets(cfg);

  // 1. Unix socket (Verge Rev default).
  if (cfg.autoDiscover) {
    for (const sock of VERGE_SOCKETS) {
      if (!unixSocketAlive(sock)) continue;
      for (const secret of secrets) {
        const t = new UnixSocketTransport(sock, secret);
        if (await probe(t)) {
          return { transport: t, note: `connected · unix socket ${sock}` };
        }
      }
      return {
        transport: null,
        note: `unix socket ${sock} present but auth failed — set mihomo-switch.secret`,
      };
    }
  }

  // 2. TCP — manual override first, then probed defaults.
  const endpoints: string[] = [];
  if (cfg.endpoint) endpoints.push(cfg.endpoint);
  if (cfg.autoDiscover) {
    for (const e of TCP_ENDPOINTS) if (!endpoints.includes(e)) endpoints.push(e);
  }

  let aliveButAuthFailed: string | null = null;
  for (const ep of endpoints) {
    if (!(await tcpAlive(ep))) continue;
    for (const secret of secrets) {
      const t = new TcpTransport(ep, secret);
      if (await probe(t)) {
        return { transport: t, note: `connected · tcp ${ep}` };
      }
    }
    aliveButAuthFailed = ep;
  }

  if (aliveButAuthFailed) {
    return { transport: null, note: `${aliveButAuthFailed} reachable but auth failed — set mihomo-switch.secret` };
  }
  return {
    transport: null,
    note: 'no local mihomo found (no unix socket, no tcp 9097/9090)',
  };
}
