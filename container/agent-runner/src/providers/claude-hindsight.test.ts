import { describe, it, expect } from 'bun:test';

import { plainText, resolveHindsightTarget } from './claude-hindsight.js';

// Auto-memory must switch itself on from the group's existing hindsight MCP
// wiring and stay off for anything it cannot derive a bank from — a wrong
// guess would retain every turn into the wrong bank.

const hindsight = (url: string, type = 'http') => ({ hindsight: { type, url } });

describe('resolveHindsightTarget', () => {
  it('derives base URL and bank from the pinned MCP URL', () => {
    expect(resolveHindsightTarget(hindsight('http://host.docker.internal:8888/mcp/pero/'), {})).toEqual({
      baseUrl: 'http://host.docker.internal:8888',
      bank: 'pero',
    });
  });

  it('accepts the URL without a trailing slash', () => {
    expect(resolveHindsightTarget(hindsight('http://172.17.0.1:8888/mcp/team-bank'), {})).toEqual({
      baseUrl: 'http://172.17.0.1:8888',
      bank: 'team-bank',
    });
  });

  it('stays off without a bank-pinned URL', () => {
    expect(resolveHindsightTarget(hindsight('http://host.docker.internal:8888/mcp/'), {})).toBeNull();
    expect(resolveHindsightTarget(hindsight('http://host.docker.internal:8888/mcp/a/b/'), {})).toBeNull();
    expect(resolveHindsightTarget(hindsight('not a url'), {})).toBeNull();
  });

  it('stays off when no server is named hindsight or it is not http', () => {
    expect(resolveHindsightTarget({}, {})).toBeNull();
    expect(resolveHindsightTarget({ memory: { type: 'http', url: 'http://h:1/mcp/x/' } }, {})).toBeNull();
    expect(resolveHindsightTarget(hindsight('http://h:1/mcp/x/', 'sse'), {})).toBeNull();
    expect(resolveHindsightTarget({ hindsight: { command: 'hindsight-mcp' } }, {})).toBeNull();
  });

  it('HINDSIGHT_AUTO=0 disables it; any other value leaves it on', () => {
    const servers = hindsight('http://h:8888/mcp/pero/');
    expect(resolveHindsightTarget(servers, { HINDSIGHT_AUTO: '0' })).toBeNull();
    expect(resolveHindsightTarget(servers, { HINDSIGHT_AUTO: '1' })?.bank).toBe('pero');
  });
});

describe('plainText', () => {
  it('keeps only message bodies, falling back to the raw text', () => {
    expect(plainText('<message id="1" sender="A" time="t">hi there</message>\n<message to="x">ok</message>')).toBe(
      'hi there\nok',
    );
    expect(plainText('  /status  ')).toBe('/status');
  });
});
