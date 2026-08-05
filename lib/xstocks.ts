import { z } from 'zod';

const XSTOCKS_API_ORIGIN = 'https://api.xstocks.fi/api/v2';
const MAX_RESPONSE_BYTES = 256_000;

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

export const xstocksPublicRequestSchema = z.object({ operation: xstocksPublicOperationSchema, symbol: symbolSchema.optional(), query: querySchema.optional().default({}) });
export type XstocksPublicRequest = z.infer<typeof xstocksPublicRequestSchema>;

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
