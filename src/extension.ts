import * as vscode from 'vscode';
import { discoverInstance } from './discovery';
import { showSwitchPicker } from './quickpick';
import { ProxyTreeProvider } from './tree-view';
import { StatusBar } from './status-bar';
import { collectGroups } from './proxies-util';
import { readConfig } from './config';
import { openDashboard } from './dashboard';
import { openSetupGuide } from './setup';
import type { Transport } from './transport';
import type { Proxy } from './types';

const DEFAULT_TEST_URL = 'http://www.gstatic.com/generate_204';

/**
 * Orchestrates discovery → client → UI. Owns the active mihomo instance and
 * wires commands, the tree view, and the status bar together.
 */
class MihomoSwitch {
  private readonly statusBar = new StatusBar();
  private readonly tree = new ProxyTreeProvider();
  private client: Transport | null = null;
  private lastNote = '';

  constructor(private readonly ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(
      vscode.window.registerTreeDataProvider('mihomo-switch.proxies', this.tree),
      vscode.commands.registerCommand('mihomo-switch.switchProxy', () => this.switchProxy()),
      vscode.commands.registerCommand('mihomo-switch.selectNode', (group?: string, proxy?: string) =>
        this.selectNode(group, proxy),
      ),
      vscode.commands.registerCommand('mihomo-switch.testLatency', () => this.testLatency()),
      vscode.commands.registerCommand('mihomo-switch.selectInstance', () => this.configureInstance()),
      vscode.commands.registerCommand('mihomo-switch.refresh', () => this.refresh()),
      vscode.commands.registerCommand('mihomo-switch.openDashboard', () => openDashboard(this.ctx)),
      vscode.commands.registerCommand('mihomo-switch.setupController', () => openSetupGuide()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('mihomo-switch')) {
          void this.rediscover();
        }
      }),
      this.statusBar,
    );
  }

  async start(): Promise<void> {
    await this.rediscover();
  }

  /** Re-run discovery, swap the client, refresh UI. Safe to call repeatedly. */
  private async rediscover(): Promise<Transport | null> {
    this.statusBar.setDiscovering();
    this.client?.dispose();
    this.client = null;

    const result = await discoverInstance(readConfig());
    if (!result.transport) {
      this.lastNote = result.note;
      this.statusBar.setNoInstance(result.note);
      return null;
    }
    this.client = result.transport;
    this.statusBar.attach(this.client);
    await this.refresh();
    return this.client;
  }

  /** Fetch proxies, push to the tree, update the status-bar's current proxy. */
  private async refresh(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }
    try {
      const { proxies } = await client.getProxies();
      this.tree.setProxies(proxies);
      this.statusBar.setCurrentProxy(this.pickDisplayProxy(proxies));
    } catch (err) {
      this.statusBar.setOffline(this.errorMessage(err));
    }
  }

  /**
   * Resolve the node name to show in the status bar. mihomo's GLOBAL group
   * usually points at a policy group, which in turn points at the real node —
   * step one level in so the user sees the actual exit node.
   */
  private pickDisplayProxy(proxies: Record<string, Proxy>): string | null {
    const groups = collectGroups(proxies);
    const groupNames = new Set(groups.map((g) => g.name));
    const root = groups.find((g) => g.name === 'GLOBAL') ?? groups[0];
    const now = root?.now;
    if (!now) {
      return null;
    }
    if (groupNames.has(now)) {
      return proxies[now]?.now ?? now;
    }
    return now;
  }

  private async switchProxy(): Promise<void> {
    const client = this.client ?? (await this.rediscover());
    if (!client) {
      return;
    }
    const picked = await showSwitchPicker(client);
    if (!picked) {
      return;
    }
    await this.applySelection(client, picked.group, picked.proxy);
  }

  private async selectNode(group?: string, proxy?: string): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }
    // invoked from the command palette without args -> fall back to the picker
    if (!group || !proxy) {
      const picked = await showSwitchPicker(client);
      if (!picked) {
        return;
      }
      await this.applySelection(client, picked.group, picked.proxy);
      return;
    }
    await this.applySelection(client, group, proxy);
  }

  private async applySelection(client: Transport, group: string, proxy: string): Promise<void> {
    try {
      await client.selectProxy(group, proxy);
      await this.refresh();
    } catch (err) {
      void vscode.window.showErrorMessage(`Mihomo: switch failed — ${this.errorMessage(err)}`);
    }
  }

  private async testLatency(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }
    const { proxies } = await client.getProxies();
    const groups = collectGroups(proxies);
    const target = groups.find((g) => g.name === 'GLOBAL') ?? groups[0];
    if (!target) {
      return;
    }
    const url =
      vscode.workspace.getConfiguration('mihomo-switch').get<string>('testUrl') || DEFAULT_TEST_URL;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Mihomo: testing latency (${target.name})…`,
        cancellable: false,
      },
      async () => {
        await Promise.all(
          target.all.map(async (name) => {
            try {
              await client.testDelay(name, url, 5000);
            } catch {
              // individual node failures are expected (timeout / unreachable)
            }
          }),
        );
        await this.refresh();
      },
    );
  }

  private async configureInstance(): Promise<void> {
    const authFailed = /auth failed/i.test(this.lastNote);
    const message = authFailed
      ? 'Mihomo Switch: reachable, but authentication failed. Set the correct secret, or check the setup guide.'
      : 'Mihomo Switch: no local mihomo instance found. Start Clash Verge / mihomo, or follow the setup guide.';
    const choice = await vscode.window.showWarningMessage(message, 'Setup Guide', 'Open Settings', 'Retry');
    if (choice === 'Setup Guide') {
      openSetupGuide();
    } else if (choice === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'mihomo-switch');
    } else if (choice === 'Retry') {
      void this.rediscover();
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  dispose(): void {
    this.client?.dispose();
  }
}

let active: MihomoSwitch | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  active = new MihomoSwitch(ctx);
  void active.start();
}

export function deactivate(): void {
  active?.dispose();
  active = undefined;
}
