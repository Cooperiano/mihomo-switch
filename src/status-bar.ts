import * as vscode from 'vscode';
import { formatTraffic } from './format';
import type { Transport } from './transport';
import type { TrafficSample } from './types';

/**
 * Persistent status-bar controller. Reflects the live `/traffic` stream and
 * the currently selected proxy. Clicking it opens the QuickPick switcher.
 */
export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private client: Transport | null = null;
  private currentProxy: string | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'mihomo-switch.switchProxy';
    this.setDiscovering();
    this.item.show();
  }

  setDiscovering(): void {
    this.item.text = '$(loading~spin) Mihomo…';
    this.item.tooltip = 'discovering local instance';
    this.item.backgroundColor = undefined;
  }

  setOnline(): void {
    this.item.backgroundColor = undefined;
    this.render();
  }

  setOffline(reason?: string): void {
    this.item.text = '$(debug-disconnect) Mihomo Offline';
    this.item.tooltip = reason ?? 'mihomo unreachable — reconnecting';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setNoInstance(note: string): void {
    this.item.text = '$(warning) Mihomo: not found';
    this.item.tooltip = `${note}\n(click → open settings)`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    // point the click at configuration instead of the switcher
    this.item.command = 'mihomo-switch.selectInstance';
  }

  /** Bind a discovered client and start streaming traffic. Replaces any prior binding. */
  attach(client: Transport): void {
    this.detach();
    this.client = client;
    // restore click target — setNoInstance() may have redirected it to settings
    this.item.command = 'mihomo-switch.switchProxy';
    client.startTraffic(
      (sample: TrafficSample) => this.render(sample),
      (online: boolean) => {
        if (!online) this.setOffline();
        else this.setOnline();
      },
    );
  }

  detach(): void {
    this.client?.dispose();
    this.client = null;
  }

  /** Update the proxy name shown (called after a switch / refresh). */
  setCurrentProxy(name: string | null): void {
    this.currentProxy = name;
    this.render();
  }

  private render(sample?: TrafficSample): void {
    if (!this.client) return;
    const name = this.currentProxy ?? 'mihomo';
    const traffic = sample ? `  ${formatTraffic(sample.up, sample.down)}` : '';
    this.item.text = `$(globe) ${name}${traffic}`;
    this.item.tooltip = `Mihomo Switch · ${this.currentProxy ?? 'no proxy selected'}`;
    this.item.backgroundColor = undefined;
  }

  dispose(): void {
    this.detach();
    this.item.dispose();
  }
}
