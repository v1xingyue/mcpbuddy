const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export const solanaAssets = [
  { symbol: 'SOL', name: 'Solana', mint: null, coingeckoId: 'solana' },
  { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', coingeckoId: 'usd-coin' },
  { symbol: 'USDT', name: 'Tether', mint: 'Es9vMFrzaCERmJfrF4H2FYDUGNnNCKRrQkZ9p4M5f7p', coingeckoId: 'tether' },
  { symbol: 'JUP', name: 'Jupiter', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', coingeckoId: 'jupiter-exchange-solana' },
  { symbol: 'BONK', name: 'Bonk', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6H7d3QY2fS2Z8vY', coingeckoId: 'bonk' },
] as const;

type RpcResponse<T> = { result?: T; error?: { message?: string } };
type TokenAccount = { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } };

export type SolanaAssetBalance = { symbol: string; name: string; mint: string | null; balance: string; priceUsd: number | null; valueUsd: number | null };

function displayAmount(amount: string, decimals: number) {
  const padded = amount.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals) || '0';
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, '') : '';
  return fraction ? `${whole}.${fraction}` : whole;
}

async function rpc<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`Solana RPC request failed (${response.status}).`);
  const body = await response.json() as RpcResponse<T>;
  if (body.error || body.result === undefined) throw new Error(body.error?.message ?? 'Solana RPC returned no result.');
  return body.result;
}

async function pricesUsd() {
  const ids = solanaAssets.map(asset => asset.coingeckoId).join(',');
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { next: { revalidate: 30 } });
    if (!response.ok) throw new Error(`Price service request failed (${response.status}).`);
    const body = await response.json() as Record<string, { usd?: number }>;
    return new Map(solanaAssets.map(asset => [asset.symbol, body[asset.coingeckoId]?.usd ?? null]));
  } catch {
    // A rate-limited quote provider must not prevent read-only balance access.
    return new Map<string, number | null>(solanaAssets.map(asset => [asset.symbol, null]));
  }
}

/** Reads only a small allowlist of liquid Solana assets; it never requests signing authority. */
export async function getMainSolanaAssetBalances(address: string, rpcUrl: string): Promise<SolanaAssetBalance[]> {
  const [lamports, legacyAccounts, prices] = await Promise.all([
    rpc<number>(rpcUrl, 'getBalance', [address, { commitment: 'confirmed' }]),
    rpc<{ value: TokenAccount[] }>(rpcUrl, 'getTokenAccountsByOwner', [address, { programId: TOKEN_PROGRAM_ID }, { encoding: 'jsonParsed' }]),
    pricesUsd(),
  ]);
  const tokenAmounts = new Map<string, { amount: bigint; decimals: number }>();
  for (const account of legacyAccounts.value) {
    const token = account.account.data.parsed.info.tokenAmount;
    const mint = account.account.data.parsed.info.mint;
    const current = tokenAmounts.get(mint);
    tokenAmounts.set(mint, { amount: (current?.amount ?? 0n) + BigInt(token.amount), decimals: token.decimals });
  }
  return solanaAssets.map((asset) => {
    const token = asset.mint ? tokenAmounts.get(asset.mint) : { amount: BigInt(lamports), decimals: 9 };
    const balance = token ? displayAmount(token.amount.toString(), token.decimals) : '0';
    const priceUsd = prices.get(asset.symbol) ?? null;
    const valueUsd = priceUsd === null ? null : Number((Number(balance) * priceUsd).toFixed(2));
    return { symbol: asset.symbol, name: asset.name, mint: asset.mint, balance, priceUsd, valueUsd };
  });
}
