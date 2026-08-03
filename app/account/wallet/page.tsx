import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { provisionUserForSession } from '@/app/actions';
import { WalletAssetsPanel } from '@/components/wallet-assets-panel';
import { PendingSwapsPanel } from '@/components/pending-swaps-panel';
import { WalletButton } from '@/components/wallet-button';
import { env } from '@/lib/config';
import { getDb } from '@/lib/db';
import { walletBindings, walletTokenWatchlist } from '@/lib/db/schema';
import { getMainSolanaPortfolio, type SolanaPortfolio } from '@/lib/solana-assets';
import { pendingSwapsForUser } from '@/lib/solana-swap';

export default async function AccountWalletPage({ searchParams }: { searchParams: Promise<{ swap?: string }> }) {
  const user = await provisionUserForSession(await auth());
  if (!user) redirect('/');
  const { swap: autoSignId } = await searchParams;
  const db = getDb();
  const [[wallet], pendingSwaps, watchlist] = await Promise.all([
    db.select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1),
    pendingSwapsForUser(user.id),
    db.select({ mint: walletTokenWatchlist.mint, symbol: walletTokenWatchlist.symbol, name: walletTokenWatchlist.name }).from(walletTokenWatchlist).where(eq(walletTokenWatchlist.userId, user.id)),
  ]);
  const customAssets = watchlist.map(item => ({ ...item, decimals: 0, coingeckoId: '' }));
  const assetResult: SolanaPortfolio | { error: string } | null = wallet ? await getMainSolanaPortfolio(wallet.address, env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com', customAssets).catch(error => ({ error: error instanceof Error ? error.message : 'Unknown Solana RPC error.' })) : null;

  return <><header className="app-page-head"><p className="eyebrow">ACCOUNT · WALLET</p><h1>Wallet</h1><p>Review your Mainnet portfolio and every transaction before your wallet signs it.</p></header>
    {assetResult && wallet && <WalletAssetsPanel address={wallet.address} assets={'assets' in assetResult ? assetResult.assets : undefined} diagnostics={'diagnostics' in assetResult ? assetResult.diagnostics : undefined} error={'error' in assetResult ? assetResult.error : undefined} />}
    {wallet ? <PendingSwapsPanel swaps={pendingSwaps} autoSignId={autoSignId} /> : <section className="account-empty-state"><h2>Connect a Solana wallet</h2><p>Bind a wallet before reviewing assets or transactions. MCPBuddy only verifies your signature; it never stores a private key.</p><WalletButton /></section>}
  </>;
}
