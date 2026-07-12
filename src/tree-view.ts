import * as vscode from 'vscode';
import { collectGroups, lastDelay } from './proxies-util';
import type { Proxy, ProxyGroupView } from './types';

type TreeNode = GroupNode | ProxyNode;

class GroupNode extends vscode.TreeItem {
  constructor(readonly group: ProxyGroupView) {
    super(group.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'group';
    this.description = `${group.all.length} · ${group.now}`;
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

class ProxyNode extends vscode.TreeItem {
  constructor(groupName: string, name: string, delay: number, current: boolean) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.description = delay > 0 ? `${delay}ms` : '—';
    this.contextValue = current ? 'currentProxy' : 'proxy';
    this.iconPath = new vscode.ThemeIcon(current ? 'check' : 'debug-disconnect');
    // clicking a node selects it directly (no QuickPick)
    this.command = {
      command: 'mihomo-switch.selectNode',
      title: 'Select Proxy',
      arguments: [groupName, name],
    };
  }
}

/** Activity-bar tree: groups expand to their member proxies. */
export class ProxyTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private groups: ProxyGroupView[] = [];
  private proxyMap: Record<string, Proxy> = {};

  private readonly _onDidChange = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  setProxies(proxies: Record<string, Proxy>): void {
    this.proxyMap = proxies;
    this.groups = collectGroups(proxies);
    this._onDidChange.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.groups.map((g) => new GroupNode(g));
    }
    if (element instanceof GroupNode) {
      return element.group.all.map(
        (name) =>
          new ProxyNode(element.group.name, name, lastDelay(this.proxyMap[name]), name === element.group.now),
      );
    }
    return [];
  }
}
