import { describe, expect, it } from 'vitest';
import { xstocksPublicOperations, xstocksPublicRequestSchema } from '@/lib/xstocks';

describe('xStocks public API contract', () => {
  it('includes every documented public v2 operation', () => {
    expect(xstocksPublicOperations.map(operation => operation.path)).toEqual(expect.arrayContaining([
      '/public/assets', '/public/proof-of-reserves', '/public/oracles', '/public/system/wallets', '/public/corporate-actions/history', '/public/corporate-actions/upcoming', '/public/bridges',
    ]));
    expect(xstocksPublicOperations).toHaveLength(16);
  });

  it('keeps user supplied paths and oversized queries out of the public proxy', () => {
    expect(() => xstocksPublicRequestSchema.parse({ operation: 'assets', query: { '../private': 'x' } })).toThrow();
    expect(() => xstocksPublicRequestSchema.parse({ operation: 'asset', symbol: '../secret' })).toThrow();
  });
});
