import type { SolanaAssetBalance, SolanaPortfolioDiagnostics } from '@/lib/solana-assets';
import { WalletButton } from '@/components/wallet-button';

function usd(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function amount(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(numeric) : value;
}

export function WalletAssetsPanel({ address, assets, diagnostics, error }: { address: string; assets?: SolanaAssetBalance[]; diagnostics?: SolanaPortfolioDiagnostics; error?: string }) {
  const pricedAssets = assets?.filter(asset => asset.valueUsd !== null) ?? [];
  const totalValue = pricedAssets.length > 0 ? pricedAssets.reduce((total, asset) => total + (asset.valueUsd ?? 0), 0) : null;
  const holdingCount = assets?.length ?? 0;
  return <section className="wallet-assets-panel" aria-labelledby="wallet-assets-title"><header className="wallet-assets-heading"><div><p className="label">SOLANA WALLET</p><h2 id="wallet-assets-title">Mainnet portfolio</h2><WalletButton address={address} /></div><div className="wallet-assets-total"><p>{pricedAssets.length === holdingCount ? 'PORTFOLIO VALUE' : 'PRICED VALUE'}</p><b>{usd(totalValue)}</b><small>{holdingCount} {holdingCount === 1 ? 'asset tracked' : 'assets tracked'}</small></div></header>{error ? <p className="wallet-assets-message" role="status">Solana RPC unavailable: {error} Configure a production <code>SOLANA_RPC_URL</code>, then refresh.</p> : holdingCount === 0 ? <p className="wallet-assets-empty" role="status">No balance found in your wallet yet.</p> : <div className="wallet-assets-list">{assets?.map(asset => <article className="wallet-asset" key={asset.mint ?? asset.symbol} title={asset.mint ?? undefined}><div className="wallet-asset-token"><b>{asset.symbol}</b><small title={`${asset.balance} ${asset.symbol}`}>{amount(asset.balance)} {asset.symbol}</small></div><div className="wallet-asset-value"><b>{usd(asset.valueUsd)}</b><small>{asset.priceUsd === null ? (asset.name === 'Unrecognized SPL token' ? 'Mint shown on hover' : 'Price unavailable') : `${usd(asset.priceUsd)} each`}</small></div></article>)}</div>}{diagnostics && <details className="wallet-assets-debug"><summary>Token scan debug</summary><p>RPC: {diagnostics.rpcHost}</p><p>Owner scan: {diagnostics.ownerScan.status}, {diagnostics.ownerScan.accountCount} account(s){diagnostics.ownerScan.error ? ` — ${diagnostics.ownerScan.error}` : ''}</p>{diagnostics.mintFallback.length > 0 && <ul>{diagnostics.mintFallback.map(item => <li key={item.symbol}>{item.symbol}: {item.accountCount} account(s){item.error ? ` — ${item.error}` : ''}</li>)}</ul>}</details>}</section>;
}
