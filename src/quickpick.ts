import * as vscode from 'vscode';
import { buildProxyItems, collectGroups, lastDelay } from './proxies-util';
import type { Transport } from './transport';

/**
 * Two-level QuickPick switcher: pick a group, then pick a node.
 * Recently-used nodes (that belong to the chosen group) are pinned to the top
 * under a "最近使用" separator. Latency shown is the last recorded value from
 * `/proxies` (live re-test is a separate command). Returns the chosen
 * {group, proxy} or null if cancelled.
 */
export async function showSwitchPicker(
  client: Transport,
  recent: string[] = [],
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

  // Level 2 — node, with recently-used pinned to the top.
  const recentInGroup = recent.filter((n) => group.all.includes(n));
  const items: (vscode.QuickPickItem & { proxyName?: string })[] = [];

  const descFor = (name: string): string => {
    const delay = lastDelay(proxies[name]);
    const d = delay > 0 ? `${delay}ms` : '—';
    return name === group.now ? `${d} · current` : d;
  };

  if (recentInGroup.length > 0) {
    items.push({ label: '最近使用', kind: vscode.QuickPickItemKind.Separator });
    for (const name of recentInGroup) {
      items.push({ label: `★ ${name}`, description: descFor(name), proxyName: name });
    }
    items.push({ label: '全部节点', kind: vscode.QuickPickItemKind.Separator });
  }

  const recentSet = new Set(recentInGroup);
  for (const p of buildProxyItems(group, proxies)) {
    if (recentSet.has(p.label)) continue; // already shown in the recent section
    items.push({
      label: p.label,
      description: p.picked ? `${p.description} · current` : p.description,
      proxyName: p.proxyName,
    });
  }

  const proxyPick = await vscode.window.showQuickPick(items, {
    title: `Mihomo Switch · ${group.name}`,
    placeHolder: 'node',
  });
  if (!proxyPick?.proxyName) return null;

  return { group: group.name, proxy: proxyPick.proxyName };
}
