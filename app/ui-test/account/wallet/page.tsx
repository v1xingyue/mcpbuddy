import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { WalletAssetsPanel } from '@/components/wallet-assets-panel';
import { isLocalUiTestMode } from '@/lib/local-ui-test-mode';

const fixtureAssets = [
  { symbol: 'SOL', name: 'Solana', mint: null, balance: '0.141992', priceUsd: 72.33, valueUsd: 10.27, isWhitelisted: false },
  { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGkZwyTDt1v', balance: '13.158477', priceUsd: 1, valueUsd: 13.15, isWhitelisted: false },
  { symbol: 'NVDAx', name: 'NVIDIA xStock', mint: '9Yj5B2LQ9QEDhHWr7z1aQPFZdh5iJ9u6rT5z7EN6TgZe', balance: '0.014912', priceUsd: null, valueUsd: null, isWhitelisted: true },
];

export default function LocalWalletVisualFixture() {
  if (!isLocalUiTestMode()) notFound();

  return <AppShell active="account" name="Visual test account" visualTestMode>
    <div className="account-layout">
      <div className="account-content">
        <header className="app-page-head"><p className="eyebrow">ACCOUNT · WALLET</p><h1>Wallet</h1><p>Review your Mainnet portfolio and every transaction before your wallet signs it.</p></header>
        <WalletAssetsPanel address="Dyfmb11111111111111111111111111111111111111" assets={fixtureAssets} readOnly />
      </div>
    </div>
  </AppShell>;
}
