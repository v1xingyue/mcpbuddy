'use client';

import { useEffect, useRef, useState } from 'react';
import { VersionedTransaction } from '@solana/web3.js';

type Summary = { kind?: 'swap' | 'transfer'; inputToken?: string; outputToken?: string; inputMint: string; outputMint: string; inputAmount?: string; inputAmountAtomic: string; expectedOutputAtomic: string; minimumOutputAtomic: string; expectedOutput?: string; minimumOutput?: string; slippageBps: number; priceImpactPct: string | null; route: string[]; recipient?: string; feePayer: string; instructionProgramIds: string[]; transactionDigest: string };
type Pending = { id: string; serializedTransaction: string; summary: string; expiresAt: Date; createdAt: Date };
type Provider = {
  signTransaction?(transaction: VersionedTransaction): Promise<VersionedTransaction>;
  signAllTransactions?(transactions: VersionedTransaction[]): Promise<VersionedTransaction[]>;
};
function decode(value: string) { const binary = atob(value); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function encode(value: Uint8Array) { let binary = ''; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary); }
function short(value: string) { return `${value.slice(0, 5)}…${value.slice(-4)}`; }

export function PendingSwapsPanel({ swaps, autoSignId }: { swaps: Pending[]; autoSignId?: string }) {
  const [status, setStatus] = useState(''); const [pending, setPending] = useState(false);
  const autoStarted = useRef(false);
  const records = swaps.map(swap => ({ ...swap, summary: JSON.parse(swap.summary) as Summary }));
  async function submitSignedTransaction(record: (typeof records)[number], signed: VersionedTransaction) {
    const signedTransaction = encode(signed.serialize());
    const response = await fetch(`/api/swaps/${record.id}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preSignTransaction: record.serializedTransaction, signedTransaction }) });
    const body = await response.json() as { signature?: string; error?: string };
    if (!response.ok || !body.signature) throw new Error(body.error ?? 'Submission failed.');
    return body.signature;
  }
  async function refresh(record: (typeof records)[number]) {
    const response = await fetch(`/api/swaps/${record.id}/refresh`, { method: 'POST' });
    const body = await response.json() as { error?: string; transactionId?: string };
    if (!response.ok) throw new Error(body.error ?? 'Could not refresh the transaction.');
    if (!body.transactionId) throw new Error('The refreshed transaction did not return an ID.');
    return body.transactionId;
  }
  async function signOne(record: (typeof records)[number]) {
    try {
      setPending(true); setStatus('Opening your wallet to review this transaction…');
      if (new Date(record.expiresAt) <= new Date()) throw new Error('This transaction has expired. Ask your AI client to create a fresh quote.');
      if (Date.now() - new Date(record.createdAt).getTime() > 30_000) {
        const refreshedId = await refresh(record);
        setStatus('A fresh quote is ready. Reopening its review-and-sign flow…');
        window.setTimeout(() => window.location.assign(`/account/wallet?swap=${refreshedId}`), 800);
        return;
      }
      const provider = (window as Window & { solana?: Provider }).solana;
      if (!provider?.signTransaction) throw new Error('This wallet does not support Solana transaction signing. Connect a wallet that provides signTransaction.');
      const transaction = VersionedTransaction.deserialize(decode(record.serializedTransaction));
      const signature = await submitSignedTransaction(record, await provider.signTransaction(transaction));
      setStatus(`Swap submitted: ${short(signature)}`); window.setTimeout(() => window.location.reload(), 1_000);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Signing was cancelled or failed.'); } finally { setPending(false); }
  }
  async function signAll() {
    try {
      setPending(true); setStatus('Opening your wallet to review the selected transactions…');
      const provider = (window as Window & { solana?: Provider }).solana;
      if (!provider?.signTransaction) throw new Error('This wallet does not support Solana transaction signing. Connect a wallet that provides signTransaction.');
      const active = records.filter(record => new Date(record.expiresAt) > new Date());
      if (!active.length) throw new Error('All pending transactions have expired. Ask your AI client to create fresh quotes.');
      const stale = active.filter(record => Date.now() - new Date(record.createdAt).getTime() > 30_000);
      if (stale.length) {
        await Promise.all(stale.map(refresh));
        setStatus('Fresh quotes are ready. Review their updated details, then select Review & sign all again.');
        window.setTimeout(() => window.location.reload(), 800);
        return;
      }
      const transactions = active.map(record => VersionedTransaction.deserialize(decode(record.serializedTransaction)));
      const signed = provider.signAllTransactions
        ? await provider.signAllTransactions(transactions)
        : await Promise.all(transactions.map(transaction => provider.signTransaction!(transaction)));
      if (signed.length !== active.length) throw new Error(`Wallet returned ${signed.length} signed transaction(s) for ${active.length} requested transaction(s). Nothing was broadcast.`);
      const signatures = await Promise.all(signed.map((transaction, index) => submitSignedTransaction(active[index], transaction)));
      setStatus(`${signatures.length} swap${signatures.length === 1 ? '' : 's'} submitted. ${signatures.map(short).join(', ')}`); window.setTimeout(() => window.location.reload(), 1_500);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Signing was cancelled or failed.'); } finally { setPending(false); }
  }
  async function deleteOne(id: string) {
    try {
      setPending(true); setStatus('Deleting unsigned transaction…');
      const response = await fetch(`/api/swaps/${id}/submit`, { method: 'DELETE' });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? 'Delete failed.'); }
      setStatus('Unsigned transaction deleted.'); window.setTimeout(() => window.location.reload(), 500);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not delete transaction.'); } finally { setPending(false); }
  }
  useEffect(() => {
    const target = autoSignId ? records.find(record => record.id === autoSignId) : undefined;
    if (!target || autoStarted.current) return;
    autoStarted.current = true;
    void signOne(target);
  // The link is intentionally one-shot: it must not re-open a wallet after a render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSignId]);
  return <section className="pending-swaps" aria-labelledby="pending-swaps-title"><header><div><p className="label">SIGNING QUEUE</p><h2 id="pending-swaps-title">Pending transactions</h2><p>Review every transaction in your wallet before signing.</p></div>{records.length > 0 && <button type="button" onClick={() => void signAll()} disabled={pending}>{pending ? 'Waiting for wallet…' : `Review & sign all (${records.length})`}</button>}</header>{records.length === 0 ? <p className="wallet-assets-empty">No pending transactions.</p> : <div className="pending-swap-list">{records.map(record => <article className="pending-swap" key={record.id}><div className="pending-swap-title"><b>{record.summary.kind === 'transfer' ? 'Token transfer' : 'Swap'}</b><time>Expires {new Date(record.expiresAt).toLocaleTimeString()}</time></div><dl><div><dt>{record.summary.kind === 'transfer' ? 'You send' : 'You pay'}</dt><dd>{record.summary.inputAmount ?? record.summary.inputAmountAtomic} {record.summary.inputToken ?? short(record.summary.inputMint)}</dd></div><div><dt>{record.summary.kind === 'transfer' ? 'Recipient' : 'Expected / minimum receive'}</dt><dd>{record.summary.kind === 'transfer' ? short(record.summary.recipient ?? '') : `${record.summary.expectedOutput ?? record.summary.expectedOutputAtomic} / ${record.summary.minimumOutput ?? record.summary.minimumOutputAtomic} ${record.summary.outputToken ?? ''}`}</dd></div><div><dt>Transaction content</dt><dd>Fee payer {short(record.summary.feePayer)} · {record.summary.instructionProgramIds.length} program{record.summary.instructionProgramIds.length === 1 ? '' : 's'} · SHA-256 {record.summary.transactionDigest.slice(0, 12)}…</dd></div></dl>{record.summary.route.length > 0 && <p className="swap-route">Route: {record.summary.route.join(' → ')}</p>}<div className="pending-swap-actions"><button type="button" onClick={() => void signOne(record)} disabled={pending}>Review & sign</button><button type="button" className="pending-swap-delete" onClick={() => void deleteOne(record.id)} disabled={pending}>Delete</button></div></article>)}</div>}{status && <p className="swap-status" role="status">{status}</p>}</section>;
}
