import { afterEach, describe, expect, it, vi } from 'vitest';
import { getXstock, listXstocks, xstocksPublicOperations, xstocksPublicRequestSchema } from '@/lib/xstocks';

const nvda = { name: 'NVIDIA xStock', symbol: 'NVDAx', deployments: [{ address: 'NVDASolanaMint11111111111111111111111111111111', network: 'Solana' }, { address: '0x123', network: 'Ethereum' }] };
const noSolana = { name: 'Other xStock', symbol: 'OTHx', deployments: [{ address: '0x456', network: 'Ethereum' }] };

afterEach(() => vi.unstubAllGlobals());

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

  it('normalizes the Solana catalog without exposing deployments on other chains', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ nodes: [noSolana, nvda] }), { status: 200 })));
    await expect(listXstocks()).resolves.toEqual([{ symbol: 'NVDAx', name: 'NVIDIA', mint: 'NVDASolanaMint11111111111111111111111111111111', chain: 'solana' }]);
  });

  it('combines the documented public asset data into a Solana xStock detail', async () => {
    vi.stubGlobal('fetch', vi.fn((url: URL) => {
      const path = url.pathname;
      const data = path.endsWith('/price-data') ? { quote: 216.38 }
        : path.endsWith('/multiplier') ? { currentMultiplier: 1 }
          : path.endsWith('/oracles/NVDAx') ? { nodes: [{ network: 'Solana', address: null, metadata: { hermesId: 'pyth-feed-id' } }] }
            : nvda;
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
    }));
    await expect(getXstock('NVDAx')).resolves.toEqual({
      symbol: 'NVDAx', name: 'NVIDIA', mint: 'NVDASolanaMint11111111111111111111111111111111', chain: 'solana',
      price: 216.38, multiplier: 1, oracle: 'pyth-feed-id', metadataUri: null,
    });
  });

  it('rejects an xStock without a Solana deployment', async () => {
    vi.stubGlobal('fetch', vi.fn((url: URL) => {
      const path = url.pathname;
      const data = path.endsWith('/price-data') ? { quote: 1 }
        : path.endsWith('/multiplier') ? { currentMultiplier: 1 }
          : path.endsWith('/oracles/OTHx') ? { nodes: [] }
            : noSolana;
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
    }));
    await expect(getXstock('OTHx')).rejects.toThrow('OTHx does not have a Solana deployment.');
  });
});
