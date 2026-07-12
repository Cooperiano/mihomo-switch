import { describe, it, expect } from 'vitest';
import { parseSecretFromYaml } from '../src/discovery';

describe('parseSecretFromYaml', () => {
  it('returns a non-empty string secret', () => {
    expect(parseSecretFromYaml('secret: abc-123_x\nport: 7890')).toBe('abc-123_x');
  });

  it('returns undefined for empty / missing / non-string secret', () => {
    expect(parseSecretFromYaml('secret: ""')).toBeUndefined();
    expect(parseSecretFromYaml('port: 7890')).toBeUndefined();
    expect(parseSecretFromYaml('')).toBeUndefined();
    expect(parseSecretFromYaml('secret: 12345')).toBeUndefined(); // numeric, not string
    expect(parseSecretFromYaml('secret: null')).toBeUndefined();
  });

  it('does not filter placeholder-looking values — discovery validates them live', () => {
    // `set-your-secret` is a non-empty string, so it is returned as a candidate;
    // discovery's secretWorks() then rejects it if the server disagrees.
    expect(parseSecretFromYaml('secret: set-your-secret')).toBe('set-your-secret');
  });

  it('survives corrupt / non-yaml input without throwing', () => {
    expect(parseSecretFromYaml(': : : not valid yaml')).toBeUndefined();
    expect(parseSecretFromYaml('---\n- a list\n- not a map')).toBeUndefined();
  });
});
