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

export function WalletAssetsPanel({ address, assets, error }: { address: string; assets?: SolanaAssetBalance[]; error?: string }) {
  const totalValue = assets?.every(asset => asset.valueUsd !== null) ? assets.reduce((total, asset) => total + (asset.valueUsd ?? 0), 0) : null;
  const holdingCount = assets?.length ?? 0;
  return <section className="wallet-assets-panel" aria-labelledby="wallet-assets-title"><header className="wallet-assets-heading"><div><p className="label">SOLANA WALLET</p><h2 id="wallet-assets-title">Mainnet portfolio</h2><WalletButton address={address} /></div><div className="wallet-assets-total"><p>PORTFOLIO VALUE</p><b>{usd(totalValue)}</b><small>{holdingCount} {holdingCount === 1 ? 'asset tracked' : 'assets tracked'}</small></div></header>{error ? <p className="wallet-assets-message" role="status">Solana RPC unavailable: {error} Configure a production <code>SOLANA_RPC_URL</code>, then refresh.</p> : holdingCount === 0 ? <p className="wallet-assets-empty" role="status">No balance found in your tracked Solana tokens yet.</p> : <div className="wallet-assets-list">{assets?.map(asset => <article className="wallet-asset" key={asset.symbol}><div className="wallet-asset-token"><b>{asset.symbol}</b><small title={`${asset.balance} ${asset.symbol}`}>{amount(asset.balance)} {asset.symbol}</small></div><div className="wallet-asset-value"><b>{usd(asset.valueUsd)}</b><small>{asset.priceUsd === null ? 'Price unavailable' : `${usd(asset.priceUsd)} each`}</small></div></article>)}</div>}</section>;
}
