import { describe, expect, it } from 'vitest';
import { CONTEXT_PACK_TEMPLATE, contextPackForMcp } from '../lib/context-pack';

describe('AI Context Pack', () => {
  it('provides a structured starter template', () => {
    expect(CONTEXT_PACK_TEMPLATE).toContain('## Profile');
    expect(CONTEXT_PACK_TEMPLATE).toContain('## Hard limits');
    expect(CONTEXT_PACK_TEMPLATE).toContain('## Tool guidance');
    expect(CONTEXT_PACK_TEMPLATE).toContain('create_solana_swap_by_mint');
    expect(CONTEXT_PACK_TEMPLATE).toContain('Never infer, replace, or select a mint');
  });

  it('preserves saved Markdown and returns a useful empty-state response', () => {
    expect(contextPackForMcp('  # My brief  ')).toBe('# My brief');
    expect(contextPackForMcp('')).toContain('Context Pack is empty');
  });
});
