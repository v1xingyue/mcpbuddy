import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMainSolanaAssetBalances } from '@/lib/solana-assets';

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
    expect(assets.find(asset => asset.symbol === 'SOL')).toMatchObject({ balance: '1.5', priceUsd: 100, valueUsd: 150 });
  });
});
