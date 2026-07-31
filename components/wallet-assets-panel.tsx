import type { SolanaAssetBalance } from '@/lib/solana-assets';

function usd(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function amount(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(numeric) : value;
}

export function WalletAssetsPanel({ assets, error }: { assets?: SolanaAssetBalance[]; error?: boolean }) {
  return <section className="wallet-assets-panel" aria-labelledby="wallet-assets-title"><div className="wallet-assets-heading"><div><p className="label">WALLET ASSETS</p><h2 id="wallet-assets-title">Mainnet portfolio</h2></div><span>USD</span></div>{error ? <p className="wallet-assets-message">Assets are temporarily unavailable. Try refreshing in a moment.</p> : <div className="wallet-assets-list">{assets?.map(asset => <div className="wallet-asset" key={asset.symbol}><div><b>{asset.symbol}</b><small>{amount(asset.balance)} {asset.symbol}</small></div><div><b>{usd(asset.valueUsd)}</b><small>{asset.priceUsd === null ? 'Price unavailable' : `${usd(asset.priceUsd)} each`}</small></div></div>)}</div>}</section>;
}
