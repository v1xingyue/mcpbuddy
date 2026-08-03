import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMainSolanaAssetBalances, parseSolanaFamousTokens, solanaAssets } from '@/lib/solana-assets';

describe('getMainSolanaAssetBalances', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the lamport value from Solana’s getBalance response envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (!init?.body) return Response.json({ solana: { usd: 100 } });
      const request = JSON.parse(String(init?.body)) as { method?: string };
      if (request.method === 'getBalance') return Response.json({ result: { context: { slot: 1 }, value: 1_500_000_000 } });
      if (request.method === 'getTokenAccountsByOwner') return Response.json({ result: { context: { slot: 1 }, value: [] } });
      return Response.json({});
    }));
    const assets = await getMainSolanaAssetBalances('11111111111111111111111111111111', 'https://rpc.example');
    expect(assets.map(asset => asset.symbol)).toEqual(['SOL']);
    expect(assets.find(asset => asset.symbol === 'SOL')).toMatchObject({ balance: '1.5', priceUsd: 100, valueUsd: 150 });
  });

  it('still returns SOL when the token-account RPC endpoint is rate limited', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (!init?.body) return Response.json({ solana: { usd: 100 } });
      const request = JSON.parse(String(init.body)) as { method?: string };
      if (request.method === 'getBalance') return Response.json({ result: { value: 2_000_000_000 } });
      if (request.method === 'getTokenAccountsByOwner') return Response.json({ error: { message: 'Too many requests' } });
      return Response.json({});
    }));
    const assets = await getMainSolanaAssetBalances('11111111111111111111111111111111', 'https://rpc.example');
    expect(assets).toEqual([expect.objectContaining({ symbol: 'SOL', balance: '2', valueUsd: 200 })]);
  });

  it('loads the famous-token list from the JSON configuration', () => {
    expect(solanaAssets.map(asset => asset.symbol)).toEqual(['SOL', 'USDC', 'USDT', 'wSOL', 'JUP', 'JTO', 'PYTH', 'RAY', 'WIF', 'BONK']);
  });

  it('accepts a custom famous-token list and rejects duplicate symbols', () => {
    const configured = parseSolanaFamousTokens([{ symbol: 'PYTH', name: 'Pyth Network', mint: 'HZ1JovNiVvGrGNiiYvKCX9tcPvd7HXtZbCscQPXXZ8M6', decimals: 6, coingeckoId: 'pyth-network' }]);
    expect(configured).toEqual([{ symbol: 'PYTH', name: 'Pyth Network', mint: 'HZ1JovNiVvGrGNiiYvKCX9tcPvd7HXtZbCscQPXXZ8M6', decimals: 6, coingeckoId: 'pyth-network' }]);
    expect(() => parseSolanaFamousTokens([{ symbol: 'SOL', name: 'Solana', mint: null, decimals: 9, coingeckoId: 'solana' }, { symbol: 'sol', name: 'Wrapped Solana', mint: 'So11111111111111111111111111111111111111112', decimals: 9, coingeckoId: 'wrapped-solana' }])).toThrow('duplicate symbol');
  });
});
