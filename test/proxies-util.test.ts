import { describe, it, expect } from 'vitest';
import { collectGroups, buildProxyItems, lastDelay } from '../src/proxies-util';
import type { Proxy } from '../src/types';

const proxies: Record<string, Proxy> = {
  GLOBAL: { name: 'GLOBAL', type: 'Selector', now: 'Proxy', all: ['Proxy', 'DIRECT'] },
  Proxy: { name: 'Proxy', type: 'Selector', now: 'HK-01', all: ['HK-01', 'US-01'] },
  Auto: { name: 'Auto', type: 'URLTest', now: 'HK-01', all: ['HK-01', 'US-01'] },
  'HK-01': { name: 'HK-01', type: 'Shadowsocks', history: [{ delay: 120 }] },
  'US-01': { name: 'US-01', type: 'Shadowsocks', history: [{ delay: 0 }, { delay: 250 }] },
  DIRECT: { name: 'DIRECT', type: 'Direct' },
};

describe('collectGroups', () => {
  it('keeps only group types that have members', () => {
    const names = collectGroups(proxies).map((g) => g.name);
    expect(names).toContain('GLOBAL');
    expect(names).toContain('Proxy');
    expect(names).toContain('Auto');
    // outbounds and empty groups are excluded
    expect(names).not.toContain('HK-01');
    expect(names).not.toContain('DIRECT');
  });

  it('captures now and all for each group', () => {
    const proxy = collectGroups(proxies).find((g) => g.name === 'Proxy')!;
    expect(proxy.now).toBe('HK-01');
    expect(proxy.all).toEqual(['HK-01', 'US-01']);
  });
});

describe('lastDelay', () => {
  it('returns the most recent history entry', () => {
    expect(lastDelay(proxies['HK-01'])).toBe(120);
    expect(lastDelay(proxies['US-01'])).toBe(250);
  });

  it('returns 0 when there is no history', () => {
    expect(lastDelay(proxies['DIRECT'])).toBe(0);
    expect(lastDelay(undefined)).toBe(0);
  });
});

describe('buildProxyItems', () => {
  it('flags the current node and surfaces the last delay', () => {
    const group = collectGroups(proxies).find((g) => g.name === 'Proxy')!;
    const items = buildProxyItems(group, proxies);
    expect(items).toHaveLength(2);

    const hk = items.find((i) => i.proxyName === 'HK-01')!;
    expect(hk.picked).toBe(true);
    expect(hk.description).toBe('120ms');

    const us = items.find((i) => i.proxyName === 'US-01')!;
    expect(us.picked).toBe(false);
    expect(us.description).toBe('250ms');
  });
});
