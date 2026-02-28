import { describe, it, expect, beforeEach } from 'vitest';
import { setAllowlist, isAllowed } from '../src/security/allowlist.js';

describe('computer-use allowlist', () => {
  beforeEach(() => {
    setAllowlist('agent-1', []);
  });

  it('isAllowed returns true when no allowlist configured', () => {
    expect(isAllowed('agent-1', 'https://example.com/page')).toBe(true);
  });

  it('isAllowed returns true for exact domain match', () => {
    setAllowlist('agent-1', ['example.com']);
    expect(isAllowed('agent-1', 'https://example.com/path')).toBe(true);
    expect(isAllowed('agent-1', 'https://sub.example.com/path')).toBe(true);
  });

  it('isAllowed returns false for non-listed domain', () => {
    setAllowlist('agent-1', ['example.com']);
    expect(isAllowed('agent-1', 'https://evil.com/page')).toBe(false);
  });

  it('allowlist is per-agent', () => {
    setAllowlist('agent-1', ['example.com']);
    setAllowlist('agent-2', ['other.com']);
    expect(isAllowed('agent-1', 'https://other.com/')).toBe(false);
    expect(isAllowed('agent-2', 'https://other.com/')).toBe(true);
  });

  it('domain matching is case-insensitive', () => {
    setAllowlist('agent-1', ['Example.COM']);
    expect(isAllowed('agent-1', 'https://EXAMPLE.com/path')).toBe(true);
  });

  it('invalid URL returns false', () => {
    setAllowlist('agent-1', ['example.com']);
    expect(isAllowed('agent-1', 'not-a-url')).toBe(false);
  });
});
