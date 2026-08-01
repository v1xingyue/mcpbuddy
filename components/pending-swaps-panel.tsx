'use client';

import { useState } from 'react';
import { VersionedTransaction } from '@solana/web3.js';

type Summary = { inputMint: string; outputMint: string; inputAmountAtomic: string; expectedOutputAtomic: string; minimumOutputAtomic: string; slippageBps: number; priceImpactPct: string | null; route: string[]; feePayer: string; requiredSigners: string[]; instructionProgramIds: string[]; transactionDigest: string };
type Pending = { id: string; serializedTransaction: string; summary: string; expiresAt: Date; createdAt: Date };
type Provider = { signAllTransactions(transactions: VersionedTransaction[]): Promise<VersionedTransaction[]> };

function decode(value: string) { const binary = atob(value); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function encode(value: Uint8Array) { let binary = ''; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary); }
function short(value: string) { return `${value.slice(0, 5)}…${value.slice(-4)}`; }

export function PendingSwapsPanel({ swaps }: { swaps: Pending[] }) {
  const [status, setStatus] = useState(''); const [pending, setPending] = useState(false);
  const records = swaps.map(swap => ({ ...swap, summary: JSON.parse(swap.summary) as Summary }));
  async function signAll() {
    try {
      setPending(true); setStatus('Opening your wallet to review the selected transactions…');
      const provider = (window as Window & { solana?: Provider }).solana;
      if (!provider?.signAllTransactions) throw new Error('This wallet does not support batch signing. Use a Wallet Standard wallet with signAllTransactions.');
      const active = records.filter(record => new Date(record.expiresAt) > new Date());
      if (!active.length) throw new Error('All pending transactions have expired. Ask your AI client to create fresh quotes.');
      const transactions = active.map(record => VersionedTransaction.deserialize(decode(record.serializedTransaction)));
      const signed = await provider.signAllTransactions(transactions);
      const results = await Promise.all(signed.map(async (transaction, index) => {
        const response = await fetch(`/api/swaps/${active[index].id}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedTransaction: encode(transaction.serialize()) }) });
        const body = await response.json() as { signature?: string; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Submission failed.');
        return body.signature!;
      }));
      setStatus(`${results.length} swap${results.length === 1 ? '' : 's'} submitted. ${results.map(short).join(', ')}`);
      window.setTimeout(() => window.location.reload(), 1_500);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Signing was cancelled or failed.'); } finally { setPending(false); }
  }
  return <section className="pending-swaps" aria-labelledby="pending-swaps-title"><header><div><p className="label">SIGNING QUEUE</p><h2 id="pending-swaps-title">Pending swaps</h2><p>Every card is an immutable transaction generated for your bound wallet. Review the minimum received amount before signing.</p></div>{records.length > 0 && <button type="button" onClick={() => void signAll()} disabled={pending}>{pending ? 'Waiting for wallet…' : `Review & sign all (${records.length})`}</button>}</header>{records.length === 0 ? <p className="wallet-assets-empty">No pending swap transactions.</p> : <div className="pending-swap-list">{records.map(({ id, summary, expiresAt }) => <article className="pending-swap" key={id}><div className="pending-swap-title"><b>Swap</b><time>Expires {new Date(expiresAt).toLocaleTimeString()}</time></div><dl><div><dt>You pay</dt><dd>{summary.inputAmountAtomic} <small>{short(summary.inputMint)}</small></dd></div><div><dt>Expected / minimum receive</dt><dd>{summary.expectedOutputAtomic} / {summary.minimumOutputAtomic} <small>{short(summary.outputMint)}</small></dd></div><div><dt>Protection</dt><dd>{summary.slippageBps} bps max slippage{summary.priceImpactPct ? ` · ${summary.priceImpactPct}% price impact` : ''}</dd></div><div><dt>Transaction content</dt><dd>Fee payer {short(summary.feePayer)} · {summary.instructionProgramIds.length} program{summary.instructionProgramIds.length === 1 ? '' : 's'} · SHA-256 {summary.transactionDigest.slice(0, 12)}…</dd></div></dl>{summary.route.length > 0 && <p className="swap-route">Route: {summary.route.join(' → ')}</p>}</article>)}</div>}{status && <p className="swap-status" role="status">{status}</p>}</section>;
}
