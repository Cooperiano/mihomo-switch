# Mihomo Switch

> 键盘驱动、编辑器原生的 mihomo 代理控制器。**切节点不离开 VSCode。**

状态栏一点 → QuickPick 选组 → 选节点，全程键盘秒切。活动栏还有一棵代理树，点节点即切。

## 它是什么 / 不是什么

**是**:一个轻量的、editor-native 的 mihomo 控制器。连接你**已经在跑**的 mihomo / Clash Verge 实例，在编辑器里完成切节点、看流量、测延迟。

**不是**:又一个 web dashboard，也不自带 mihomo 内核，也不做 TUN / 系统代理。

| | Clash Verge / metacubexd 桌面版 | Mihomo Switch |
| --- | --- | --- |
| 形态 | 独立窗口 App | VSCode 插件 |
| 切节点 | 切窗口 + 鼠标 | 状态栏 + 键盘，不离开编辑器 |
| 内核 | 自带 | 连接你已有的实例 |
| TUN / 系统代理 | ✅ | ❌（交给独立 App） |

如果你常驻 VSCode/Cursor、只想在编码时秒切代理，这就是为你做的。

## 前置要求

本机已经在跑 mihomo，或 Clash Verge Rev（默认开 `127.0.0.1:9097`）。插件不自带内核。

## 安装（开发版）

```bash
git clone <this-repo> mihomo-switch
cd mihomo-switch
npm install
```

在 VSCode / Cursor 里打开该目录，按 `F5` 启动「扩展开发宿主」。宿主窗口里状态栏应自动出现当前节点 + 实时上下行。

打包成 `.vsix`：

```bash
npm install -g @vscode/vsce
vsce package
# 在 VSCode 里「从 VSIX 安装」生成的 mihomo-switch-0.1.0.vsix
```

## 配置

默认零配置即用（自动探测 `9097` → `9090`，并从 Clash Verge 配置目录读取 secret）。需要时可覆盖：

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `mihomo-switch.endpoint` | `""` | 手动指定 `host:port`，覆盖自动发现 |
| `mihomo-switch.secret` | `""` | 手动指定 secret，覆盖自动发现 |
| `mihomo-switch.autoDiscover` | `true` | 探测端口 + 读 Clash Verge 配置 |
| `mihomo-switch.testUrl` | `http://www.gstatic.com/generate_204` | 测延迟用的 URL |

## 命令

- **Mihomo Switch: Switch Proxy** — 两级 QuickPick 切节点（也绑定到状态栏点击）
- **Mihomo Switch: Test Latency** — 并行测当前组所有节点延迟
- **Mihomo Switch: Select Instance** — 未发现实例时的配置入口
- **Mihomo Switch: Refresh** — 重新拉取代理列表

## 工作原理

1. **发现**：探测 `127.0.0.1:9097`（Verge 默认）→ `9090`（mihomo 标准），`GET /version` 验活。
2. **认证**：候选 secret 链 = 手动设置 > Clash Verge 的 `clash-verge.yaml`/`config.yaml` > 空；带 `Authorization: Bearer` 试 `GET /proxies`，200 即正确。
3. **控制**：`PUT /proxies/:group` 切节点，`GET /proxies/:name/delay` 测延迟，`WS /traffic` 实时上下行。

> Clash Verge 把 controller 地址通过 mihomo 命令行（`-ext-ctl`）传入，所以配置文件里 `external-controller` 留空——本插件因此**靠探测而非读配置**拿地址，更鲁棒。

## 安全

- 只连接 `127.0.0.1` 回环。**不要**把 endpoint 指向 `0.0.0.0` 或公网地址。
- secret 仅在内存中作为 Bearer 传递，不写日志。
- Clash 系曾有「绑 `0.0.0.0` + 空 secret → 1-click RCE」的案例。绑回环 + 设 secret 是底线。详见 [Clash Verge RCE 分析](https://bbs.kanxue.com/thread-286909-1.htm)。

## Roadmap

- [ ] 配置即代码：workspace 里的 `config.yaml` 用 JSON Schema 校验 + 保存即 `PUT /configs` 热重载
- [ ] workspace 自动分流：按项目自动套规则 / 节点
- [ ] 连接视图：轻量 TreeView 展示活跃连接

## 致谢

- [mihomo (Clash.Meta)](https://github.com/MetaCubeX/mihomo) — 内核与 external-controller API
- [metacubexd](https://github.com/MetaCubeX/metacubexd) — 参考了 dashboard 的交互思路
- [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) — 实例发现的现实参数

## License

MIT
