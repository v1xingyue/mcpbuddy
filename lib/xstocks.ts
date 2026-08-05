import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { xstocksSolanaAssetCache } from '@/lib/db/schema';

const XSTOCKS_API_ORIGIN = 'https://api.xstocks.fi/api/v2';
const MAX_RESPONSE_BYTES = 256_000;
const SOLANA_ASSET_CACHE_KEY = 'solana-assets-v1';
const SOLANA_ASSET_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DEXSCREENER_SOLANA_TOKENS_ORIGIN = 'https://api.dexscreener.com/tokens/v1/solana';
const DEXSCREENER_BATCH_SIZE = 30;

/** Public, unauthenticated operations from the xStocks API v2 reference. */
export const xstocksPublicOperations = [
  { id: 'asset', path: '/public/assets/{symbol}', description: 'Get one xStocks asset by symbol.', requiresSymbol: true },
  { id: 'assets', path: '/public/assets', description: 'List xStocks assets.', requiresSymbol: false },
  { id: 'asset_multiplier', path: '/public/assets/{symbol}/multiplier', description: 'Get an asset’s current multiplier.', requiresSymbol: true },
  { id: 'asset_multiplier_history', path: '/public/assets/{symbol}/multiplier/history', description: 'Get multiplier history for an asset.', requiresSymbol: true },
  { id: 'asset_price_data', path: '/public/assets/{symbol}/price-data', description: 'Get price data for an asset.', requiresSymbol: true },
  { id: 'asset_circulating_supply', path: '/public/assets/{symbol}/circulating-supply', description: 'Get circulating supply for an asset.', requiresSymbol: true },
  { id: 'asset_total_supply', path: '/public/assets/{symbol}/total-supply', description: 'Get total supply for an asset.', requiresSymbol: true },
  { id: 'proof_of_reserves', path: '/public/proof-of-reserves', description: 'List proof-of-reserves data.', requiresSymbol: false },
  { id: 'asset_proof_of_reserves', path: '/public/proof-of-reserves/{symbol}', description: 'Get proof-of-reserves data for an asset.', requiresSymbol: true },
  { id: 'oracles', path: '/public/oracles', description: 'List oracle configurations.', requiresSymbol: false },
  { id: 'asset_oracle', path: '/public/oracles/{symbol}', description: 'Get oracle configuration for an asset.', requiresSymbol: true },
  { id: 'asset_system_status', path: '/public/system/status/{symbol}', description: 'Get system status for an asset.', requiresSymbol: true },
  { id: 'system_wallets', path: '/public/system/wallets', description: 'List xStocks system wallets.', requiresSymbol: false },
  { id: 'corporate_actions_history', path: '/public/corporate-actions/history', description: 'Get historical corporate actions.', requiresSymbol: false },
  { id: 'corporate_actions_upcoming', path: '/public/corporate-actions/upcoming', description: 'Get upcoming corporate actions.', requiresSymbol: false },
  { id: 'bridges', path: '/public/bridges', description: 'List supported bridges.', requiresSymbol: false },
] as const;

export type XstocksPublicOperation = typeof xstocksPublicOperations[number]['id'];
export const xstocksPublicOperationSchema = z.enum(xstocksPublicOperations.map(operation => operation.id) as [XstocksPublicOperation, ...XstocksPublicOperation[]]);
const symbolSchema = z.string().trim().regex(/^[A-Za-z0-9._-]{1,32}$/);
const querySchema = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/), z.string().trim().min(1).max(120)).refine(query => Object.keys(query).length <= 12, 'At most 12 query parameters are allowed.');
const solanaNetwork = 'Solana';

type XstocksAsset = {
  name: string;
  symbol: string;
  logo?: string;
  deployments: Array<{ address: string; network: string }>;
};

export type XstocksSolanaAsset = {
  symbol: string;
  name: string;
  mint: string;
  chain: 'solana';
};

export type Xstock = XstocksSolanaAsset & {
  price: number;
  multiplier: number;
  oracle: string | null;
  /** xStocks public v2 publishes a logo URL, but not an on-chain metadata URI. */
  metadataUri: null;
};

export type XstocksListItem = Omit<XstocksSolanaAsset, 'chain'>;
export type XstocksPage = { xstocks: XstocksListItem[]; nextCursor: string | null };
export type XstockMarket = XstocksSolanaAsset & { price: number; volume24hUsd: number | null; volumeSource: 'dexscreener'; fetchedAt: string };

export const xstocksPublicRequestSchema = z.object({ operation: xstocksPublicOperationSchema, symbol: symbolSchema.optional(), query: querySchema.optional().default({}) });
export type XstocksPublicRequest = z.input<typeof xstocksPublicRequestSchema>;

function operationFor(id: XstocksPublicOperation) {
  return xstocksPublicOperations.find(operation => operation.id === id)!;
}

/** Fetches only explicitly documented unauthenticated xStocks v2 endpoints. */
export async function getXstocksPublicData(request: XstocksPublicRequest) {
  const parsed = xstocksPublicRequestSchema.parse(request);
  const operation = operationFor(parsed.operation);
  if (operation.requiresSymbol && !parsed.symbol) throw new Error(`${parsed.operation} requires a symbol.`);
  if (!operation.requiresSymbol && parsed.symbol) throw new Error(`${parsed.operation} does not accept a symbol.`);
  const path = operation.requiresSymbol ? operation.path.replace('{symbol}', encodeURIComponent(parsed.symbol!)) : operation.path;
  const url = new URL(`${XSTOCKS_API_ORIGIN}${path}`);
  for (const [key, value] of Object.entries(parsed.query)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { accept: 'application/json' }, next: { revalidate: 30 } });
  if (!response.ok) throw new Error(`xStocks public API request failed (${response.status}).`);
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error('xStocks response is too large to return safely. Narrow query parameters and try again.');
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new Error('xStocks response is too large to return safely. Narrow query parameters and try again.');
  try { return { operation: parsed.operation, data: JSON.parse(body) as unknown, fetchedAt: new Date().toISOString() }; }
  catch { throw new Error('xStocks public API returned an invalid JSON response.'); }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('xStocks public API returned an unexpected response.');
  return value as Record<string, unknown>;
}

function asAsset(value: unknown): XstocksAsset {
  const asset = asRecord(value);
  if (typeof asset.name !== 'string' || typeof asset.symbol !== 'string' || !Array.isArray(asset.deployments)) throw new Error('xStocks asset response is missing required fields.');
  const deployments = asset.deployments.map(deployment => {
    const parsed = asRecord(deployment);
    if (typeof parsed.address !== 'string' || typeof parsed.network !== 'string') throw new Error('xStocks asset deployment response is missing required fields.');
    return { address: parsed.address, network: parsed.network };
  });
  return { name: asset.name, symbol: asset.symbol, ...(typeof asset.logo === 'string' ? { logo: asset.logo } : {}), deployments };
}

function solanaAsset(asset: XstocksAsset): XstocksSolanaAsset | null {
  const deployment = asset.deployments.find(item => item.network === solanaNetwork);
  return deployment ? { symbol: asset.symbol, name: asset.name, mint: deployment.address, chain: 'solana' } : null;
}

async function fetchSolanaXstocks(): Promise<XstocksSolanaAsset[]> {
  const result = await getXstocksPublicData({ operation: 'assets' });
  const body = asRecord(result.data);
  if (!Array.isArray(body.nodes)) throw new Error('xStocks assets response is missing nodes.');
  return body.nodes.map(asAsset).map(solanaAsset).filter((asset): asset is XstocksSolanaAsset => asset !== null)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function cachedSolanaXstocks(serialized: string): XstocksSolanaAsset[] {
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed)) throw new Error('Cached xStocks assets are invalid.');
  return parsed.map(item => {
    const asset = asRecord(item);
    if (typeof asset.symbol !== 'string' || typeof asset.name !== 'string' || typeof asset.mint !== 'string' || asset.chain !== 'solana') throw new Error('Cached xStocks asset is invalid.');
    return { symbol: asset.symbol, name: asset.name, mint: asset.mint, chain: 'solana' };
  });
}

type CachedSolanaXstocks = { assets: XstocksSolanaAsset[]; fetchedAt: Date } | null;

async function loadCachedSolanaXstocks(): Promise<CachedSolanaXstocks> {
  try {
    const [cached] = await getDb().select().from(xstocksSolanaAssetCache).where(eq(xstocksSolanaAssetCache.cacheKey, SOLANA_ASSET_CACHE_KEY)).limit(1);
    return cached ? { assets: cachedSolanaXstocks(cached.assets), fetchedAt: cached.fetchedAt } : null;
  } catch {
    // The public API remains available while a new migration is being applied or storage is temporarily unavailable.
    return null;
  }
}

async function storeSolanaXstocks(assets: XstocksSolanaAsset[]) {
  try {
    const fetchedAt = new Date();
    await getDb().insert(xstocksSolanaAssetCache).values({ cacheKey: SOLANA_ASSET_CACHE_KEY, assets: JSON.stringify(assets), fetchedAt })
      .onConflictDoUpdate({ target: xstocksSolanaAssetCache.cacheKey, set: { assets: JSON.stringify(assets), fetchedAt } });
  } catch {
    // A cache write must never turn a successful public data lookup into a tool failure.
  }
}

/** Lists xStocks that have a verified Solana deployment, with a shared 24-hour database cache for stable mint mappings. */
export async function listXstocks(): Promise<XstocksSolanaAsset[]> {
  const cached = await loadCachedSolanaXstocks();
  if (cached && Date.now() - cached.fetchedAt.getTime() < SOLANA_ASSET_CACHE_TTL_MS) return cached.assets;
  try {
    const assets = await fetchSolanaXstocks();
    await storeSolanaXstocks(assets);
    return assets;
  } catch (error) {
    if (cached) return cached.assets;
    throw error;
  }
}

/** Pages the cached Solana catalog with a bounded, offset-based cursor. */
export async function listXstocksPage({ limit = 50, cursor }: { limit?: number; cursor?: string } = {}): Promise<XstocksPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer from 1 to 100.');
  const offset = cursor === undefined ? 0 : /^[0-9]{1,6}$/.test(cursor) ? Number(cursor) : NaN;
  if (!Number.isSafeInteger(offset)) throw new Error('cursor is invalid. Use the nextCursor returned by a previous list_xstocks call.');
  const assets = await listXstocks();
  const items = assets.slice(offset, offset + limit).map(({ symbol, name, mint }) => ({ symbol, name, mint }));
  return { xstocks: items, nextCursor: offset + items.length < assets.length ? String(offset + items.length) : null };
}

export async function countXstocks(): Promise<number> {
  return (await listXstocks()).length;
}

/** Resolves a symbol against the verified Solana xStocks catalog, never a caller-provided mint. */
export async function findSolanaXstock(symbol: string) {
  const parsedSymbol = symbolSchema.parse(symbol);
  const asset = (await listXstocks()).find(item => item.symbol.toUpperCase() === parsedSymbol.toUpperCase());
  if (!asset) throw new Error(`${parsedSymbol} is not a verified Solana xStock.`);
  return asset;
}

type DexScreenerPair = { chainId?: unknown; baseToken?: { address?: unknown }; quoteToken?: { address?: unknown }; volume?: { h24?: unknown } };

function marketVolumesByMint(pairs: unknown, mints: Set<string>) {
  const volumes = new Map<string, number>();
  if (!Array.isArray(pairs)) return volumes;
  for (const pair of pairs as DexScreenerPair[]) {
    if (pair.chainId !== 'solana') continue;
    const volume = pair.volume?.h24;
    if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0) continue;
    for (const token of [pair.baseToken, pair.quoteToken]) if (token && typeof token.address === 'string' && mints.has(token.address)) volumes.set(token.address, (volumes.get(token.address) ?? 0) + volume);
  }
  return volumes;
}

/** Fetches public DEX 24-hour USD volume for verified xStock mints. Missing pair data stays null rather than being presented as zero volume. */
export async function xstockVolumes24h(assets: XstocksSolanaAsset[]) {
  const mints = new Set(assets.map(asset => asset.mint));
  const chunks = Array.from(mints).reduce<string[][]>((all, mint, index) => { const bucket = Math.floor(index / DEXSCREENER_BATCH_SIZE); (all[bucket] ??= []).push(mint); return all; }, []);
  const responses = await Promise.all(chunks.map(async chunk => {
    const response = await fetch(`${DEXSCREENER_SOLANA_TOKENS_ORIGIN}/${chunk.join(',')}`, { headers: { accept: 'application/json' }, next: { revalidate: 30 } });
    if (!response.ok) throw new Error(`DEX market data request failed (${response.status}).`);
    return response.json() as Promise<unknown>;
  }));
  const volumes = new Map<string, number>();
  for (const body of responses) for (const [mint, volume] of marketVolumesByMint(body, mints)) volumes.set(mint, (volumes.get(mint) ?? 0) + volume);
  return volumes;
}

/** Lists verified Solana xStocks ranked by public DEX 24-hour USD volume. */
export async function listXstocksByVolume(limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error('limit must be an integer from 1 to 25.');
  const assets = await listXstocks();
  const volumes = await xstockVolumes24h(assets);
  return assets.map(asset => ({ ...asset, volume24hUsd: volumes.get(asset.mint) ?? null, volumeSource: 'dexscreener' as const }))
    .filter(asset => asset.volume24hUsd !== null).sort((a, b) => b.volume24hUsd! - a.volume24hUsd!).slice(0, limit);
}

function oracleIdentifier(value: unknown): string | null {
  const body = asRecord(value);
  if (!Array.isArray(body.nodes)) throw new Error('xStocks oracle response is missing nodes.');
  const solanaOracle = body.nodes.map(asRecord).find(item => item.network === solanaNetwork);
  if (!solanaOracle) return null;
  if (typeof solanaOracle.address === 'string' && solanaOracle.address) return solanaOracle.address;
  const metadata = asRecord(solanaOracle.metadata);
  for (const key of ['hermesId', 'feedId', 'verifierContract']) if (typeof metadata[key] === 'string' && metadata[key]) return metadata[key] as string;
  return null;
}

/** Returns a Solana xStock with its public USD quote, multiplier, and Solana oracle identifier. */
export async function getXstock(symbol: string): Promise<Xstock> {
  const parsedSymbol = symbolSchema.parse(symbol);
  const [assetResult, priceResult, multiplierResult, oracleResult] = await Promise.all([
    getXstocksPublicData({ operation: 'asset', symbol: parsedSymbol }),
    getXstocksPublicData({ operation: 'asset_price_data', symbol: parsedSymbol }),
    getXstocksPublicData({ operation: 'asset_multiplier', symbol: parsedSymbol, query: { network: solanaNetwork } }),
    getXstocksPublicData({ operation: 'asset_oracle', symbol: parsedSymbol }),
  ]);
  const asset = solanaAsset(asAsset(assetResult.data));
  if (!asset) throw new Error(`${parsedSymbol} does not have a Solana deployment.`);
  const price = asRecord(priceResult.data).quote;
  const multiplier = asRecord(multiplierResult.data).currentMultiplier;
  if (typeof price !== 'number' || !Number.isFinite(price)) throw new Error('xStocks price response is missing quote.');
  if (typeof multiplier !== 'number' || !Number.isFinite(multiplier)) throw new Error('xStocks multiplier response is missing currentMultiplier.');
  return { ...asset, price, multiplier, oracle: oracleIdentifier(oracleResult.data), metadataUri: null };
}

/** Returns the official xStocks price together with public Solana DEX 24-hour trading volume. */
export async function getXstockMarket(symbol: string): Promise<XstockMarket> {
  const xstock = await getXstock(symbol);
  const volumes = await xstockVolumes24h([xstock]);
  return { symbol: xstock.symbol, name: xstock.name, mint: xstock.mint, chain: 'solana', price: xstock.price, volume24hUsd: volumes.get(xstock.mint) ?? null, volumeSource: 'dexscreener', fetchedAt: new Date().toISOString() };
}
