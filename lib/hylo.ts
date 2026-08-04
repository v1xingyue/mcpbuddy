export type HyloAsset = {
  symbol: string;
  name: string;
  category: 'stablecoin' | 'earn' | 'lst' | 'xasset' | 'collateral';
  status: 'live' | 'coming_soon';
  mint: string | null;
  description: string;
  appUrl: string;
  docsUrl: string;
};

export type HyloProgram = {
  name: string;
  version: string;
  address: string;
  solscanUrl: string;
};

export const HYLO_DOCS_URL = 'https://docs.hylo.so';
export const HYLO_APP_URL = 'https://hylo.so';
export const HYLO_DEVELOPER_TELEGRAM_URL = 'https://t.me/+2dNAkGO9UVZjYzQ5';
export const HYLO_SDK_URL = 'https://github.com/hylo-so/sdk';

export const hyloPrograms: HyloProgram[] = [
  { name: 'Exchange', version: 'v0.1', address: 'HYEXCHtHkBagdStcJCp3xbbb9B7sdMdWXFNj6mdsG4hn', solscanUrl: 'https://solscan.io/account/HYEXCHtHkBagdStcJCp3xbbb9B7sdMdWXFNj6mdsG4hn' },
  { name: 'Stability Pool', version: 'v0.1', address: 'HysTabVUfmQBFcmzu1ctRd1Y1fxd66RBpboy1bmtDSQQ', solscanUrl: 'https://solscan.io/account/HysTabVUfmQBFcmzu1ctRd1Y1fxd66RBpboy1bmtDSQQ' },
];

export const hyloAssets: HyloAsset[] = [
  { symbol: 'hyUSD', name: 'Hylo USD', category: 'stablecoin', status: 'live', mint: '5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E', description: 'Decentralized stablecoin backed 1:1 by virtual stablecoin value across Hylo collateral pools.', appUrl: HYLO_APP_URL, docsUrl: `${HYLO_DOCS_URL}/product-guide/stablecoin` },
  { symbol: 'eHYUSD', name: 'Earn Pool hyUSD', category: 'earn', status: 'live', mint: 'HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz', description: 'Yield-bearing Earn Pool token minted by depositing hyUSD; it represents a pro rata share of compounded pool yield.', appUrl: `${HYLO_APP_URL}/earn`, docsUrl: `${HYLO_DOCS_URL}/product-guide/stablecoin` },
  { symbol: 'hyloSOL', name: 'Hylo SOL', category: 'lst', status: 'live', mint: 'hy1oXYgrBW6PVcJ4s6s2FKavRdwgWTXdfE69AxT7kPT', description: 'Hylo liquid staking token for SOL.', appUrl: HYLO_APP_URL, docsUrl: `${HYLO_DOCS_URL}/product-guide/liquid-staking-tokens` },
  { symbol: 'hyloSOL+', name: 'Hylo SOL Plus', category: 'lst', status: 'live', mint: 'hy1opf2bqRDwAxoktyWAj6f3UpeHcLydzEdKjMYGs2u', description: 'XP-focused Hylo liquid staking token for SOL.', appUrl: HYLO_APP_URL, docsUrl: `${HYLO_DOCS_URL}/product-guide/liquid-staking-tokens` },
  { symbol: 'xSOL', name: 'Leveraged SOL', category: 'xasset', status: 'live', mint: '4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs', description: 'Liquidation-resistant leveraged long exposure to SOL.', appUrl: `${HYLO_APP_URL}/leverage`, docsUrl: `${HYLO_DOCS_URL}/product-guide/xassets` },
  { symbol: 'xBTC', name: 'Leveraged BTC', category: 'xasset', status: 'coming_soon', mint: null, description: 'Planned liquidation-resistant leveraged long exposure to BTC.', appUrl: `${HYLO_APP_URL}/leverage`, docsUrl: `${HYLO_DOCS_URL}/product-guide/xassets` },
  { symbol: 'xHYPE', name: 'Leveraged HYPE', category: 'xasset', status: 'coming_soon', mint: null, description: 'Planned liquidation-resistant leveraged long exposure to HYPE.', appUrl: `${HYLO_APP_URL}/leverage`, docsUrl: `${HYLO_DOCS_URL}/product-guide/xassets` },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', category: 'collateral', status: 'live', mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', description: 'Exogenous collateral asset listed in Hylo documentation.', appUrl: HYLO_APP_URL, docsUrl: `${HYLO_DOCS_URL}/security/onchain-addresses` },
];

export const hyloOperations = {
  mint_hyusd: { title: 'Mint hyUSD', appUrl: HYLO_APP_URL, docsUrl: `${HYLO_DOCS_URL}/product-guide/stablecoin`, summary: 'Mint Hylo decentralized stablecoin from supported collateral through the Hylo app.' },
  earn_ehyusd: { title: 'Mint eHYUSD', appUrl: `${HYLO_APP_URL}/earn`, docsUrl: `${HYLO_DOCS_URL}/product-guide/stablecoin`, summary: 'Deposit hyUSD into the Earn Pool to receive eHYUSD, a pro rata yield-bearing pool token.' },
  mint_xasset: { title: 'Mint xAsset', appUrl: `${HYLO_APP_URL}/leverage`, docsUrl: `${HYLO_DOCS_URL}/product-guide/xassets`, summary: 'Mint liquidation-resistant leveraged long exposure such as xSOL through Hylo leverage flows.' },
  liquid_staking: { title: 'Liquid staking', appUrl: HYLO_APP_URL, docsUrl: `${HYLO_DOCS_URL}/product-guide/liquid-staking-tokens`, summary: 'Use Hylo liquid staking token flows for hyloSOL or hyloSOL+.' },
} as const;

export type HyloOperation = keyof typeof hyloOperations;
