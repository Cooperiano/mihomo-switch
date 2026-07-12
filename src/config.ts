import * as vscode from 'vscode';

/** Resolved extension configuration (merged from VSCode settings). */
export interface MihomoConfig {
  /** Manual endpoint override (`host:port`), or undefined to auto-discover. */
  endpoint?: string;
  /** Manual secret override, or undefined to auto-discover. */
  secret?: string;
  /** Whether to probe local ports + read Clash Verge config. */
  autoDiscover: boolean;
  /** URL used for latency testing. */
  testUrl: string;
}

const SECTION = 'mihomo-switch';
const DEFAULT_TEST_URL = 'http://www.gstatic.com/generate_204';

/** Read the current configuration. Cheap; safe to call per-command. */
export function readConfig(): MihomoConfig {
  const c = vscode.workspace.getConfiguration(SECTION);
  const endpoint = c.get<string>('endpoint')?.trim();
  const secret = c.get<string>('secret');
  return {
    endpoint: endpoint ? endpoint : undefined,
    secret: secret && secret.length > 0 ? secret : undefined,
    autoDiscover: c.get<boolean>('autoDiscover') ?? true,
    testUrl: c.get<string>('testUrl')?.trim() || DEFAULT_TEST_URL,
  };
}
