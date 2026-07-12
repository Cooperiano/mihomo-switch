/**
 * Pure formatting helpers (no vscode dependency) — unit-testable in isolation.
 */

/** Compact byte rate: 1234 -> "1.2K", 567890 -> "554K", 1500000 -> "1.5M". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ['K', 'M', 'G', 'T'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)}${units[i]}`;
}

/** Status-bar traffic label: (1234, 567890) -> "↑1.2K ↓554K". */
export function formatTraffic(up: number, down: number): string {
  return `↑${formatBytes(up)} ↓${formatBytes(down)}`;
}

/** Latency label; 0 / negative / NaN -> "timeout". */
export function formatDelay(delay: number): string {
  if (!delay || delay <= 0 || Number.isNaN(delay)) return 'timeout';
  return `${Math.round(delay)}ms`;
}
