'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import { bindWallet, createWalletChallenge } from '@/app/actions';

type SolanaProvider = { connect(): Promise<{ publicKey: { toString(): string } }>; signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }> };
export function WalletButton({ address }: { address?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(address); const [status, setStatus] = useState(''); const [pending, setPending] = useState(false); const [copied, setCopied] = useState(false);
  async function connect() {
    try {
      setPending(true); setStatus('Confirm the signature in your wallet.');
      const provider = (window as Window & { solana?: SolanaProvider }).solana;
      if (!provider) throw new Error('No Solana wallet found. Install Phantom, Backpack, or another Wallet Standard provider.');
      const result = await provider.connect(); const message = await createWalletChallenge(); const signed = await provider.signMessage(new TextEncoder().encode(message));
      const next = await bindWallet(result.publicKey.toString(), message, Array.from(signed.signature)); setValue(next); setStatus('Wallet signature verified and bound.'); router.refresh();
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not connect wallet.'); } finally { setPending(false); }
  }
  async function copyAddress() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true); setStatus('Wallet address copied.');
      window.setTimeout(() => setCopied(false), 1_800);
    } catch { setStatus('Could not copy the wallet address.'); }
  }
  const label = value ? `${value.slice(0, 5)}…${value.slice(-4)}` : 'Bind Solana wallet';
  return <div className="wallet-control"><button className={value ? 'wallet wallet-address ui-interactive-card' : 'wallet'} onClick={value ? () => void copyAddress() : connect} disabled={pending} aria-label={value ? `Copy Solana wallet address ${value}` : 'Bind Solana wallet'} title={value ? `Copy ${value}` : undefined}>{pending ? 'Waiting for wallet…' : value ? <><span>{label}</span><span className="wallet-copy-action">{copied ? <Check size={13} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={13} strokeWidth={2} aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}</span></> : 'Bind Solana wallet'}</button>{status && <p className="note" role="status">{status}</p>}</div>;
}
