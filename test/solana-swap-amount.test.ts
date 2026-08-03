import { describe, expect, it } from 'vitest';
import { toAtomicAmount } from '@/lib/solana-swap';
describe('toAtomicAmount', () => { it('converts display amounts without floating point arithmetic', () => { expect(toAtomicAmount('0.5', 6)).toBe('500000'); expect(toAtomicAmount('17.158477', 6)).toBe('17158477'); expect(toAtomicAmount('1', 9)).toBe('1000000000'); }); });
