'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

type SolanaProvider = { connect(): Promise<{ publicKey: { toString(): string } }>; signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }> };

export function WalletLoginButton() {
  const [status, setStatus] = useState('');
  async function login() {
    try {
      setStatus('Opening wallet…');
      const provider = (window as Window & { solana?: SolanaProvider }).solana;
      if (!provider) throw new Error('Install Phantom, Backpack, or another Solana wallet first.');
      const wallet = await provider.connect(); const address = wallet.publicKey.toString();
      const response = await fetch('/api/auth/wallet-challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Could not create sign-in challenge.');
      const signed = await provider.signMessage(new TextEncoder().encode(payload.message));
      await signIn('solana', { address, message: payload.message, challenge: payload.challenge, signature: JSON.stringify(Array.from(signed.signature)), callbackUrl: '/' });
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Wallet login failed.'); }
  }
  return <div><button type="button" className="wallet-login" onClick={login}>Log in with Solana wallet</button>{status && <small className="login-status">{status}</small>}</div>;
}
