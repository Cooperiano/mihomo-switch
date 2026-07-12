import * as vscode from 'vscode';
import { buildProxyItems, collectGroups } from './proxies-util';
import type { Transport } from './transport';

/**
 * Two-level QuickPick switcher: pick a group, then pick a node.
 * Latency shown is the last recorded value from `/proxies` (live re-test is a
 * separate command). Returns the chosen {group, proxy} or null if cancelled.
 */
export async function showSwitchPicker(
  client: Transport,
): Promise<{ group: string; proxy: string } | null> {
  const { proxies } = await client.getProxies();
  const groups = collectGroups(proxies);
  if (groups.length === 0) {
    vscode.window.showWarningMessage('Mihomo: no proxy groups found');
    return null;
  }

  // Level 1 — group
  const groupItems = groups.map((g) => ({
    label: g.name,
    description: `${g.type} · now: ${g.now}`,
  }));
  const groupPick = await vscode.window.showQuickPick(groupItems, {
    title: 'Mihomo Switch · Select Group',
    placeHolder: 'proxy group',
  });
  if (!groupPick) return null;
  const group = groups.find((g) => g.name === groupPick.label);
  if (!group) return null;

  // Level 2 — node
  const proxyItems = buildProxyItems(group, proxies).map((p) => ({
    label: p.label,
    description: p.picked ? `${p.description} · current` : p.description,
  }));
  const proxyPick = await vscode.window.showQuickPick(proxyItems, {
    title: `Mihomo Switch · ${group.name}`,
    placeHolder: 'node',
  });
  if (!proxyPick) return null;

  return { group: group.name, proxy: proxyPick.label };
}
