import { describe, expect, it } from 'vitest';
import { CONTEXT_PACK_TEMPLATE, contextPackForMcp } from '../lib/context-pack';

describe('AI Context Pack', () => {
  it('provides a structured starter template', () => {
    expect(CONTEXT_PACK_TEMPLATE).toContain('## Profile');
    expect(CONTEXT_PACK_TEMPLATE).toContain('## Hard limits');
    expect(CONTEXT_PACK_TEMPLATE).toContain('## Tool guidance');
  });

  it('preserves saved Markdown and returns a useful empty-state response', () => {
    expect(contextPackForMcp('  # My brief  ')).toBe('# My brief');
    expect(contextPackForMcp('')).toContain('Context Pack is empty');
  });
});
