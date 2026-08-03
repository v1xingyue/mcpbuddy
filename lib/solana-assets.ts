import { z } from 'zod';
import famousTokensConfig from '@/config/solana-famous-tokens.json';

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const PUBLIC_FALLBACK_RPC_URL = 'https://solana-rpc.publicnode.com';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER_QUOTE_URL = 'https://api.jup.ag/swap/v1/quote';
const MAX_JUPITER_PRICE_QUOTES = 25;

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

export type SolanaAssetBalance = { symbol: string; name: string; mint: string | null; balance: string; priceUsd: number | null; valueUsd: number | null; isWhitelisted: boolean };
export type SolanaPortfolioDiagnostics = { rpcHost: string; ownerScan: { status: 'ok' | 'error'; accountCount: number; error?: string }; mintFallback: Array<{ symbol: string; accountCount: number; error?: string }> };
export type SolanaPortfolio = { assets: SolanaAssetBalance[]; diagnostics: SolanaPortfolioDiagnostics };

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

function rpcEndpoints(primary: string) {
  return [...new Set([primary, PUBLIC_FALLBACK_RPC_URL])];
}

async function rpcWithFailover<T>(endpoints: string[], method: string, params: unknown[]) {
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try { return { value: await rpc<T>(endpoint, method, params), endpoint }; } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error('All configured Solana RPC endpoints failed.');
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

/** Quotes exactly one whole token to USDC through Jupiter; it never builds or signs a transaction. */
async function jupiterUsdPrice(mint: string, decimals: number) {
  if (mint === USDC_MINT) return 1;
  try {
    const amount = (10n ** BigInt(decimals)).toString();
    const response = await fetch(`${JUPITER_QUOTE_URL}?${new URLSearchParams({ inputMint: mint, outputMint: USDC_MINT, amount, slippageBps: '50' })}`, { headers: process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {}, cache: 'no-store' });
    if (!response.ok) return null;
    const quote = await response.json() as { outAmount?: unknown };
    if (typeof quote.outAmount !== 'string' || !/^\d+$/.test(quote.outAmount)) return null;
    const price = Number(displayAmount(quote.outAmount, 6));
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/** Reads only configured famous Solana assets; it never requests signing authority. */
export async function getMainSolanaPortfolio(address: string, rpcUrl: string, customAssets: SolanaAsset[] = []): Promise<SolanaPortfolio> {
  // SOL is the essential portfolio value. Token-program endpoints are frequently
  // rate-limited independently, so their failure must not hide a successful SOL read.
  const endpoints = rpcEndpoints(rpcUrl);
  const balanceResponse = await rpcWithFailover<{ value: number }>(endpoints, 'getBalance', [address, { commitment: 'confirmed' }]);
  const [ownerScans, prices] = await Promise.all([
    Promise.all([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map(programId => rpcWithFailover<{ value: TokenAccount[] }>(endpoints, 'getTokenAccountsByOwner', [address, { programId }, { encoding: 'jsonParsed' }]).then(result => ({ value: result.value, endpoint: result.endpoint, error: undefined as string | undefined })).catch(error => ({ value: null, endpoint: undefined as string | undefined, error: error instanceof Error ? error.message : 'Unknown token-account RPC error.' })))),
    pricesUsd(),
  ]);
  const ownerScan = { value: { value: ownerScans.flatMap(scan => scan.value?.value ?? []) }, endpoint: ownerScans.find(scan => scan.endpoint)?.endpoint, error: ownerScans.every(scan => scan.error) ? ownerScans.map(scan => scan.error).filter(Boolean).join('; ') : undefined as string | undefined };
  // Restore the mint-scoped fallback from the last known-good asset reader.
  // A few RPC providers return an empty owner-wide program scan while still
  // answering exact-mint requests (notably for USDC token accounts).
  const trackedAssets = [...solanaAssets, ...customAssets.filter(custom => !solanaAssets.some(asset => asset.mint === custom.mint))];
  const whitelistedMints = new Set(customAssets.map(asset => asset.mint).filter((mint): mint is string => Boolean(mint)));
  const fallbackAssets = ownerScan.value?.value?.length ? [] : trackedAssets.filter(asset => asset.mint);
  const fallbackResults = await Promise.all(fallbackAssets.map(async asset => {
    try {
      const result = await rpcWithFailover<{ value: TokenAccount[] }>(endpoints, 'getTokenAccountsByOwner', [address, { mint: asset.mint! }, { encoding: 'jsonParsed' }]);
      return { asset, accounts: result.value.value, endpoint: result.endpoint, error: undefined as string | undefined };
    } catch (error) {
      return { asset, accounts: [] as TokenAccount[], endpoint: undefined as string | undefined, error: error instanceof Error ? error.message : 'Unknown mint RPC error.' };
    }
  }));
  const tokenAccounts = ownerScan.value?.value?.length ? ownerScan.value.value : fallbackResults.flatMap(result => result.accounts);
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
  const holdings = trackedAssets.flatMap((asset) => {
    const token = asset.mint ? tokenAmounts.get(asset.mint) : { amount: BigInt(balanceResponse.value.value), decimals: 9 };
    if (!token || token.amount === 0n) return [];
    const balance = token ? displayAmount(token.amount.toString(), token.decimals) : '0';
    return [{ asset, token, balance }];
  });
  // Custom assets do not have a CoinGecko ID. For every unpriced tracked SPL
  // holding (bounded to avoid turning a watchlist into a quote fan-out), quote
  // one whole token into USDC through Jupiter's route engine.
  const routePrices = new Map<string, number | null>(await Promise.all(holdings.filter(({ asset }) => Boolean(asset.mint) && (prices.get(asset.symbol) ?? null) === null).slice(0, MAX_JUPITER_PRICE_QUOTES).map(async ({ asset, token }) => [asset.mint!, await jupiterUsdPrice(asset.mint!, token.decimals)] as const)));
  const configuredHoldings = holdings.map(({ asset, balance }) => {
    const priceUsd = prices.get(asset.symbol) ?? (asset.mint ? routePrices.get(asset.mint) ?? null : null);
    const valueUsd = priceUsd === null ? null : Number((Number(balance) * priceUsd).toFixed(2));
    return { symbol: asset.symbol, name: asset.name, mint: asset.mint, balance, priceUsd, valueUsd, isWhitelisted: asset.mint !== null && whitelistedMints.has(asset.mint) };
  });
  return {
    // Do not surface arbitrary dust/spam tokens. Only global defaults and the
    // user's explicit watchlist are shown, and both remain zero-balance hidden.
    assets: configuredHoldings,
    diagnostics: {
      rpcHost: new URL(ownerScan.endpoint ?? balanceResponse.endpoint).host,
      ownerScan: { status: ownerScan.error ? 'error' : 'ok', accountCount: ownerScan.value?.value.length ?? 0, ...(ownerScan.error ? { error: ownerScan.error } : {}) },
      mintFallback: fallbackResults.map(result => ({ symbol: result.asset.symbol, accountCount: result.accounts.length, ...(result.error ? { error: result.error } : {}) })),
    },
  };
}

/** Backwards-compatible assets-only read for the MCP tool. */
export async function getMainSolanaAssetBalances(address: string, rpcUrl: string, customAssets: SolanaAsset[] = []): Promise<SolanaAssetBalance[]> {
  return (await getMainSolanaPortfolio(address, rpcUrl, customAssets)).assets;
}
