'use client';
import { useState } from 'react';
import { bindWallet, createWalletChallenge } from '@/app/actions';

type SolanaProvider = { connect(): Promise<{ publicKey: { toString(): string } }>; signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }> };
export function WalletButton({ address }: { address?: string }) {
  const [value, setValue] = useState(address); const [status, setStatus] = useState(''); const [pending, setPending] = useState(false);
  async function connect() {
    try {
      setPending(true); setStatus('Confirm the signature in your wallet.');
      const provider = (window as Window & { solana?: SolanaProvider }).solana;
      if (!provider) throw new Error('No Solana wallet found. Install Phantom, Backpack, or another Wallet Standard provider.');
      const result = await provider.connect(); const message = await createWalletChallenge(); const signed = await provider.signMessage(new TextEncoder().encode(message));
      const next = await bindWallet(result.publicKey.toString(), message, Array.from(signed.signature)); setValue(next); setStatus('Wallet signature verified and bound.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not connect wallet.'); } finally { setPending(false); }
  }
  return <div className="wallet-control"><button className="wallet" onClick={connect} disabled={pending}>{pending ? 'Waiting for wallet…' : value ? `${value.slice(0, 5)}…${value.slice(-4)}` : 'Bind Solana wallet'}</button>{status && <p className="note" role="status">{status}</p>}</div>;
}
