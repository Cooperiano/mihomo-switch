import type { PlainQuickPickItem, Proxy, ProxyGroupView } from './types';

/**
 * Pure helpers over the `/proxies` response (no vscode dependency).
 * Shared by the QuickPick flow and the TreeView.
 */

/** Proxy types that act as groups (have a `now` + `all[]` membership list). */
const GROUP_TYPES = new Set(['Selector', 'URLTest', 'Fallback', 'LoadBalance', 'Relay']);

/** Most recent recorded latency for a proxy, or 0 if untested/timed out. */
export function lastDelay(proxy?: Proxy): number {
  const h = proxy?.history;
  if (!h || h.length === 0) return 0;
  return h[h.length - 1]?.delay ?? 0;
}

/** Extract user-relevant groups, preserving mihomo's declared order. */
export function collectGroups(proxies: Record<string, Proxy>): ProxyGroupView[] {
  return Object.values(proxies)
    .filter((p) => GROUP_TYPES.has(p.type) && Array.isArray(p.all) && p.all.length > 0)
    .map((p) => ({
      name: p.name,
      type: p.type,
      now: p.now ?? '',
      all: p.all as string[],
    }));
}

/**
 * Build plain QuickPick items for a group's members, each annotated with its
 * last known latency. The current `now` is flagged via `picked`.
 */
export function buildProxyItems(
  group: ProxyGroupView,
  proxies: Record<string, Proxy>,
): PlainQuickPickItem[] {
  return group.all.map((name) => {
    const delay = lastDelay(proxies[name]);
    return {
      label: name,
      description: delay > 0 ? `${delay}ms` : '—',
      picked: name === group.now,
      proxyName: name,
    };
  });
}
