import { describe, it, expect } from 'vitest';
import { formatBytes, formatTraffic, formatDelay } from '../src/format';

describe('formatBytes', () => {
  it('renders sub-KB values as B', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(1023)).toBe('1023B');
  });

  it('renders K/M/G with one decimal under 10, rounded above', () => {
    expect(formatBytes(1024)).toBe('1.0K');
    expect(formatBytes(1234)).toBe('1.2K');
    expect(formatBytes(10240)).toBe('10K');
    expect(formatBytes(567890)).toBe('555K'); // 554.58 rounds up
    expect(formatBytes(1572864)).toBe('1.5M');
  });
});

describe('formatTraffic', () => {
  it('renders up/down arrows with formatted rates', () => {
    expect(formatTraffic(1234, 567890)).toBe('↑1.2K ↓555K');
    expect(formatTraffic(0, 0)).toBe('↑0B ↓0B');
  });
});

describe('formatDelay', () => {
  it('renders ms for positive delays, rounded', () => {
    expect(formatDelay(120)).toBe('120ms');
    expect(formatDelay(120.7)).toBe('121ms');
  });

  it('renders timeout for missing / zero / NaN', () => {
    expect(formatDelay(0)).toBe('timeout');
    expect(formatDelay(-1)).toBe('timeout');
    expect(formatDelay(NaN)).toBe('timeout');
  });
});
