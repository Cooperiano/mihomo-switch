# Changelog

## 0.1.0

- Initial release.
- Auto-discover local mihomo / Clash Verge instance (probe `9097` → `9090`, read secret from Verge config).
- Status bar: current exit node + live `/traffic` up/down.
- Two-level QuickPick switcher (group → node) with last-known latency.
- Activity-bar tree view; click a node to switch.
- Batch latency test against `GLOBAL` (or first group).
- Re-discovery on configuration change.
