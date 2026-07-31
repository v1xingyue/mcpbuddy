import { z } from 'zod';
import famousTokensConfig from '@/config/solana-famous-tokens.json';

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

const solanaAssetSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  mint: z.string().trim().min(32).max(44).nullable(),
  coingeckoId: z.string().trim().min(1).max(100),
});

export type SolanaAsset = z.infer<typeof solanaAssetSchema>;

/** Validates the repository's famous-token JSON configuration. */
export function parseSolanaFamousTokens(value: unknown): SolanaAsset[] {
  const assets = z.array(solanaAssetSchema).min(1).max(100).parse(value);
  const symbols = new Set<string>();
  const mints = new Set<string>();
  for (const asset of assets) {
    const symbol = asset.symbol.toUpperCase();
    if (symbols.has(symbol)) throw new Error(`solana-famous-tokens.json has a duplicate symbol: ${asset.symbol}.`);
    symbols.add(symbol);
    if (asset.mint) {
      if (mints.has(asset.mint)) throw new Error(`solana-famous-tokens.json has a duplicate mint: ${asset.mint}.`);
      mints.add(asset.mint);
    }
  }
  return assets;
}

export const solanaAssets = parseSolanaFamousTokens(famousTokensConfig);

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

/** Reads only configured famous Solana assets; it never requests signing authority. */
export async function getMainSolanaAssetBalances(address: string, rpcUrl: string): Promise<SolanaAssetBalance[]> {
  const [balanceResponse, legacyAccounts, prices] = await Promise.all([
    rpc<{ value: number }>(rpcUrl, 'getBalance', [address, { commitment: 'confirmed' }]),
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
  return solanaAssets.flatMap((asset) => {
    const token = asset.mint ? tokenAmounts.get(asset.mint) : { amount: BigInt(balanceResponse.value), decimals: 9 };
    if (!token || token.amount === 0n) return [];
    const balance = token ? displayAmount(token.amount.toString(), token.decimals) : '0';
    const priceUsd = prices.get(asset.symbol) ?? null;
    const valueUsd = priceUsd === null ? null : Number((Number(balance) * priceUsd).toFixed(2));
    return [{ symbol: asset.symbol, name: asset.name, mint: asset.mint, balance, priceUsd, valueUsd }];
  });
}
