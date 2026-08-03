import { z } from 'zod';
import famousTokensConfig from '@/config/solana-famous-tokens.json';

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

const solanaAssetSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  mint: z.string().trim().min(32).max(44).nullable(),
  decimals: z.number().int().min(0).max(18),
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

/** Allowlisted assets for swap tools; symbols, not mint addresses, form the public API. */
export const solanaSwapTokens = solanaAssets.map(asset => ({ ...asset, mint: asset.mint ?? 'So11111111111111111111111111111111111111112' }));

type RpcResponse<T> = { result?: T; error?: { message?: string } };
type TokenAccount = { pubkey?: string; account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } };

export type SolanaAssetBalance = { symbol: string; name: string; mint: string | null; balance: string; priceUsd: number | null; valueUsd: number | null };

function displayAmount(amount: string, decimals: number) {
  if (decimals === 0) return amount;
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
  // SOL is the essential portfolio value. Token-program endpoints are frequently
  // rate-limited independently, so their failure must not hide a successful SOL read.
  const balanceResponse = await rpc<{ value: number }>(rpcUrl, 'getBalance', [address, { commitment: 'confirmed' }]);
  const [legacyAccounts, prices] = await Promise.all([
    rpc<{ value: TokenAccount[] }>(rpcUrl, 'getTokenAccountsByOwner', [address, { programId: TOKEN_PROGRAM_ID }, { encoding: 'jsonParsed' }]).catch(() => null),
    pricesUsd(),
  ]);
  // Restore the mint-scoped fallback from the last known-good asset reader.
  // A few RPC providers return an empty owner-wide program scan while still
  // answering exact-mint requests (notably for USDC token accounts).
  const tokenAccounts = legacyAccounts?.value?.length
    ? legacyAccounts.value
    : (await Promise.allSettled(
      solanaAssets.filter(asset => asset.mint).map(asset => rpc<{ value: TokenAccount[] }>(rpcUrl, 'getTokenAccountsByOwner', [address, { mint: asset.mint! }, { encoding: 'jsonParsed' }])),
    )).flatMap(result => result.status === 'fulfilled' ? result.value.value : []);
  const tokenAmounts = new Map<string, { amount: bigint; decimals: number }>();
  const seenAccounts = new Set<string>();
  for (const account of tokenAccounts) {
    if (account.pubkey && seenAccounts.has(account.pubkey)) continue;
    if (account.pubkey) seenAccounts.add(account.pubkey);
    const token = account.account.data.parsed.info.tokenAmount;
    const mint = account.account.data.parsed.info.mint;
    const current = tokenAmounts.get(mint);
    tokenAmounts.set(mint, { amount: (current?.amount ?? 0n) + BigInt(token.amount), decimals: token.decimals });
  }
  const configuredHoldings = solanaAssets.flatMap((asset) => {
    const token = asset.mint ? tokenAmounts.get(asset.mint) : { amount: BigInt(balanceResponse.value), decimals: 9 };
    if (!token || token.amount === 0n) return [];
    const balance = token ? displayAmount(token.amount.toString(), token.decimals) : '0';
    const priceUsd = prices.get(asset.symbol) ?? null;
    const valueUsd = priceUsd === null ? null : Number((Number(balance) * priceUsd).toFixed(2));
    return [{ symbol: asset.symbol, name: asset.name, mint: asset.mint, balance, priceUsd, valueUsd }];
  });
  const configuredMints = new Set(solanaAssets.flatMap(asset => asset.mint ? [asset.mint] : []));
  const discoveredHoldings = [...tokenAmounts.entries()]
    .filter(([mint, token]) => !configuredMints.has(mint) && token.amount > 0n)
    .map(([mint, token]) => ({ symbol: `${mint.slice(0, 4)}…${mint.slice(-4)}`, name: 'Unrecognized SPL token', mint, balance: displayAmount(token.amount.toString(), token.decimals), priceUsd: null, valueUsd: null }));
  return [...configuredHoldings, ...discoveredHoldings];
}
