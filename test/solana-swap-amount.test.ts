import { describe, expect, it } from 'vitest';
import { mergeWhitelistedSwapTokens, toAtomicAmount } from '@/lib/solana-swap';
describe('toAtomicAmount', () => { it('converts display amounts without floating point arithmetic', () => { expect(toAtomicAmount('0.5', 6)).toBe('500000'); expect(toAtomicAmount('17.158477', 6)).toBe('17158477'); expect(toAtomicAmount('1', 9)).toBe('1000000000'); }); });

describe('mergeWhitelistedSwapTokens', () => {
  it('includes a user whitelist token while keeping configured mints authoritative', () => {
    const customMint = '11111111111111111111111111111111111111112';
    const tokens = mergeWhitelistedSwapTokens([{ symbol: 'NVDAx', name: 'NVIDIA xStock', mint: customMint, decimals: 6 }, { symbol: 'USDC copy', name: 'Duplicate configured mint', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 }]);
    expect(tokens).toEqual(expect.arrayContaining([expect.objectContaining({ symbol: 'NVDAx', mint: customMint, decimals: 6 })]));
    expect(tokens.filter(token => token.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toHaveLength(1);
  });
});
