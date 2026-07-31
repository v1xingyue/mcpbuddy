import type { SolanaAssetBalance } from '@/lib/solana-assets';
import { WalletButton } from '@/components/wallet-button';

function usd(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function amount(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(numeric) : value;
}

export function WalletAssetsPanel({ address, assets, error }: { address: string; assets?: SolanaAssetBalance[]; error?: boolean }) {
  const totalValue = assets?.every(asset => asset.valueUsd !== null) ? assets.reduce((total, asset) => total + (asset.valueUsd ?? 0), 0) : null;
  return <section className="wallet-assets-panel" aria-labelledby="wallet-assets-title"><header className="wallet-assets-heading"><div><p className="label">SOLANA WALLET</p><h2 id="wallet-assets-title">Mainnet portfolio</h2><WalletButton address={address} /></div><div className="wallet-assets-total"><p>TOTAL ASSETS</p><b>{usd(totalValue)}</b><small>USD</small></div></header>{error ? <p className="wallet-assets-message">Assets are temporarily unavailable. Try refreshing in a moment.</p> : <div className="wallet-assets-list">{assets?.map(asset => <div className="wallet-asset" key={asset.symbol}><div><b>{asset.symbol}</b><small>{amount(asset.balance)} {asset.symbol}</small></div><div><b>{usd(asset.valueUsd)}</b><small>{asset.priceUsd === null ? 'Price unavailable' : `${usd(asset.priceUsd)} each`}</small></div></div>)}</div>}</section>;
}
