import { createHash } from 'crypto';
import { VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { swapTransactions, walletBindings } from '@/lib/db/schema';
import { env } from '@/lib/config';
import { solanaSwapTokens } from '@/lib/solana-assets';

const JUPITER = 'https://lite-api.jup.ag/swap/v1';
type JupiterQuote = { inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold: string; priceImpactPct?: string; routePlan?: Array<{ swapInfo?: { label?: string } }> };
type SigningSummary = { kind: 'swap'; inputToken: string; outputToken: string; inputMint: string; outputMint: string; inputAmount: string; inputAmountAtomic: string; expectedOutputAtomic: string; minimumOutputAtomic: string; slippageBps: number; priceImpactPct: string | null; route: string[]; feePayer: string; requiredSigners: string[]; instructionProgramIds: string[]; transactionDigest: string };

function headers(): Record<string, string> { return env.JUPITER_API_KEY ? { 'x-api-key': env.JUPITER_API_KEY } : {}; }
function digest(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }
/** Returns the exact message bytes from a Solana wire transaction, without parsing/re-encoding it. */
function wireMessage(serialized: string) {
  const bytes = Buffer.from(serialized, 'base64');
  let signatures = 0; let shift = 0; let offset = 0;
  for (;;) {
    if (offset >= bytes.length || shift > 21) throw new Error('Invalid Solana transaction signature prefix.');
    const byte = bytes[offset++]; signatures |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  const messageOffset = offset + signatures * 64;
  if (messageOffset >= bytes.length) throw new Error('Invalid Solana transaction: message is missing.');
  return bytes.subarray(messageOffset);
}

function signatureArea(serialized: string) {
  const bytes = Buffer.from(serialized, 'base64');
  let count = 0; let shift = 0; let offset = 0;
  for (;;) {
    if (offset >= bytes.length || shift > 21) throw new Error('Invalid Solana transaction signature prefix.');
    const byte = bytes[offset++]; count |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  const messageOffset = offset + count * 64;
  if (count < 1 || messageOffset >= bytes.length) throw new Error('Invalid Solana transaction signature area.');
  return { bytes, firstSignatureOffset: offset, message: bytes.subarray(messageOffset) };
}

/** Attach a detached fee-payer signature to the exact transaction the user reviewed. */
export function attachDetachedSignature(serializedTransaction: string, messageSignature: Uint8Array, walletAddress: string) {
  if (messageSignature.length !== 64) throw new Error(`Rejected: wallet returned a ${messageSignature.length}-byte message signature; Solana requires exactly 64 bytes.`);
  const transaction = signatureArea(serializedTransaction);
  if (!nacl.sign.detached.verify(transaction.message, messageSignature, bs58.decode(walletAddress))) throw new Error(`Rejected: this detached signature does not verify for bound wallet ${walletAddress} and the reviewed transaction message.`);
  Buffer.from(messageSignature).copy(transaction.bytes, transaction.firstSignatureOffset);
  return transaction.bytes.toString('base64');
}

function readCompactU16(bytes: Uint8Array, offset: number) {
  let value = 0; let shift = 0;
  for (;;) {
    if (offset >= bytes.length || shift > 21) throw new Error('Invalid Solana compact-u16 value.');
    const byte = bytes[offset++]; value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
  }
}

function messageLayout(message: Uint8Array) {
  const versioned = (message[0] & 0x80) !== 0;
  const headerOffset = versioned ? 1 : 0;
  if (message.length < headerOffset + 4) throw new Error('Invalid Solana transaction message.');
  const keys = readCompactU16(message, headerOffset + 3);
  const accountKeysOffset = keys.offset;
  const recentBlockhashOffset = accountKeysOffset + keys.value * 32;
  if (recentBlockhashOffset + 32 > message.length) throw new Error('Invalid Solana transaction message: recent blockhash is missing.');
  return { versioned, headerOffset, accountKeysOffset, accountKeyCount: keys.value, recentBlockhashOffset, instructionsOffset: recentBlockhashOffset + 32 };
}

/**
 * Solana messages place the 32-byte recent blockhash directly after the static
 * account-key list. Wallets may legitimately replace that short-lived replay
 * protection value before signing. Zero only those 32 bytes, so every account,
 * instruction, amount, program, and lookup table remains byte-for-byte bound.
 */
function normalizeMessageIgnoringRecentBlockhash(message: Uint8Array) {
  const normalized = Buffer.from(message);
  const layout = messageLayout(normalized);
  normalized.fill(0, layout.recentBlockhashOffset, layout.instructionsOffset);
  return normalized;
}

function transactionDifferenceHint(reviewed: Uint8Array, signed: Uint8Array) {
  const expected = normalizeMessageIgnoringRecentBlockhash(reviewed);
  const actual = normalizeMessageIgnoringRecentBlockhash(signed);
  const firstDifference = Math.min(expected.length, actual.length) === expected.length && expected.length === actual.length ? -1 : (() => { for (let index = 0; index < Math.min(expected.length, actual.length); index++) if (expected[index] !== actual[index]) return index; return Math.min(expected.length, actual.length); })();
  const layout = messageLayout(reviewed);
  let area = 'the instruction or address-lookup section';
  if (firstDifference === -1) area = 'an unknown section';
  else if (firstDifference < layout.accountKeysOffset) area = 'the transaction version or message header';
  else if (firstDifference < layout.recentBlockhashOffset) area = `static account key #${Math.floor((firstDifference - layout.accountKeysOffset) / 32) + 1}`;
  return `Rejected: signed transaction changes ${area} (first differing byte ${firstDifference}; reviewed message ${reviewed.length} bytes, signed message ${signed.length} bytes). Only recentBlockhash may change. Delete this item and create a fresh swap; do not retry the same signed payload.`;
}
function inspect(serialized: string) {
  const transaction = VersionedTransaction.deserialize(Buffer.from(serialized, 'base64'));
  const message = wireMessage(serialized); const keys = transaction.message.staticAccountKeys;
  return {
    messageBase64: Buffer.from(message).toString('base64'), transactionDigest: digest(message), feePayer: keys[0]?.toBase58() ?? '',
    requiredSigners: keys.slice(0, transaction.message.header.numRequiredSignatures).map(key => key.toBase58()),
    instructionProgramIds: [...new Set(transaction.message.compiledInstructions.map(ix => keys[ix.programIdIndex]?.toBase58()).filter((id): id is string => Boolean(id)))],
  };
}

function token(symbol: string) {
  const found = solanaSwapTokens.find(item => item.symbol.toUpperCase() === symbol.trim().toUpperCase());
  if (!found) throw new Error(`Unsupported token "${symbol}". Call list_solana_swap_tokens first and use one of its symbols.`);
  return found;
}

function toAtomicAmount(value: string, decimals: number) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('amount must be a positive decimal string, for example "0.1" or "25".');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`amount has more than ${decimals} decimal places for this token.`);
  const atomic = BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
  if (atomic <= 0n) throw new Error('amount must be greater than zero.');
  return atomic.toString();
}

export async function createSwapForUser(userId: string, args: { inputToken: string; outputToken: string; amount: string; slippageBps: number }) {
  const input = token(args.inputToken); const output = token(args.outputToken);
  if (input.mint === output.mint) throw new Error('Choose two different tokens.');
  const amount = toAtomicAmount(args.amount, input.decimals);
  if (!Number.isInteger(args.slippageBps) || args.slippageBps < 1 || args.slippageBps > 1_000) throw new Error('slippageBps must be an integer from 1 to 1000.');
  const [wallet] = await getDb().select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, userId)).limit(1);
  if (!wallet) throw new Error('No Solana wallet is bound to this account. Bind a wallet before creating a swap.');
  const query = new URLSearchParams({ inputMint: input.mint, outputMint: output.mint, amount, slippageBps: String(args.slippageBps) });
  const quoteResponse = await fetch(`${JUPITER}/quote?${query}`, { headers: headers(), cache: 'no-store' });
  if (!quoteResponse.ok) throw new Error(`Jupiter quote failed (${quoteResponse.status}).`);
  const quote = await quoteResponse.json() as JupiterQuote;
  const buildResponse = await fetch(`${JUPITER}/swap`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers() }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, blockhashSlotsToExpiry: 150 }) });
  if (!buildResponse.ok) throw new Error(`Jupiter transaction build failed (${buildResponse.status}).`);
  const built = await buildResponse.json() as { swapTransaction?: string };
  if (!built.swapTransaction) throw new Error('Jupiter did not return a transaction to sign.');
  const details = inspect(built.swapTransaction);
  if (details.feePayer !== wallet.address || !details.requiredSigners.includes(wallet.address)) throw new Error('Rejected a transaction whose required fee payer does not match the bound wallet.');
  const summary: SigningSummary = { kind: 'swap', inputToken: input.symbol, outputToken: output.symbol, inputMint: quote.inputMint, outputMint: quote.outputMint, inputAmount: args.amount, inputAmountAtomic: quote.inAmount, expectedOutputAtomic: quote.outAmount, minimumOutputAtomic: quote.otherAmountThreshold, slippageBps: args.slippageBps, priceImpactPct: quote.priceImpactPct ?? null, route: [...new Set((quote.routePlan ?? []).map(item => item.swapInfo?.label).filter((label): label is string => Boolean(label)))], ...details };
  // This is the review-record lifetime. The actual recent blockhash has a much
  // shorter life; the UI refreshes the transaction before signing when needed.
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const [row] = await getDb().insert(swapTransactions).values({ userId, walletAddress: wallet.address, serializedTransaction: built.swapTransaction, messageBase64: details.messageBase64, transactionDigest: details.transactionDigest, summary: JSON.stringify(summary), expiresAt }).returning({ id: swapTransactions.id });
  return { transactionId: row.id, expiresAt: expiresAt.toISOString(), summary };
}

export async function pendingSwapsForUser(userId: string) {
  return getDb().select({ id: swapTransactions.id, serializedTransaction: swapTransactions.serializedTransaction, summary: swapTransactions.summary, status: swapTransactions.status, expiresAt: swapTransactions.expiresAt, createdAt: swapTransactions.createdAt }).from(swapTransactions).where(and(eq(swapTransactions.userId, userId), eq(swapTransactions.status, 'awaiting_signature')));
}

/** Deletes only an unsubmitted transaction belonging to this account. No on-chain state exists yet. */
export async function deletePendingSwap(userId: string, id: string) {
  const [row] = await getDb().select({ id: swapTransactions.id, status: swapTransactions.status }).from(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId))).limit(1);
  if (!row) throw new Error('Swap transaction not found.');
  if (row.status !== 'awaiting_signature') throw new Error(`Only an unsigned pending transaction can be deleted; this one is ${row.status}.`);
  await getDb().delete(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId), eq(swapTransactions.status, 'awaiting_signature')));
}

export async function submitSignedSwap(userId: string, id: string, signedTransaction: string, preSignTransaction?: string) {
  const [row] = await getDb().select().from(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId))).limit(1);
  if (!row) throw new Error('Swap transaction not found.');
  if (row.status !== 'awaiting_signature') throw new Error(`This transaction is already ${row.status}.`);
  if (row.expiresAt <= new Date()) throw new Error('This transaction expired. Request a fresh quote and transaction.');
  if (Date.now() - row.createdAt.getTime() > 45_000) throw new Error('This signing payload is no longer current. Refresh the quote, review the new transaction, then sign it.');
  const signed = VersionedTransaction.deserialize(Buffer.from(signedTransaction, 'base64'));
  const signedMessage = wireMessage(signedTransaction);
  const reviewedMessage = wireMessage(row.serializedTransaction);
  if (preSignTransaction && !Buffer.from(wireMessage(preSignTransaction)).equals(reviewedMessage)) {
    throw new Error(`Rejected before wallet signing: the browser loaded a different transaction than pending item ${id}. This is a stale-page or transaction-ID mismatch; refresh the account page, then open the new review link.`);
  }
  if (!normalizeMessageIgnoringRecentBlockhash(signedMessage).equals(normalizeMessageIgnoringRecentBlockhash(reviewedMessage))) {
    const source = preSignTransaction ? ' The browser’s pre-sign snapshot matched the reviewed item, so the connected wallet/provider changed the transaction while signing.' : '';
    throw new Error(`${transactionDifferenceHint(reviewedMessage, signedMessage)}${source}`);
  }
  if (!signed.signatures.some(signature => signature.some(byte => byte !== 0))) throw new Error('Rejected: the wallet returned no signature. Reopen the transaction and explicitly approve it in the bound wallet.');
  if (!nacl.sign.detached.verify(signedMessage, signed.signatures[0], bs58.decode(row.walletAddress))) throw new Error(`Rejected: the first transaction signature does not verify for bound wallet ${row.walletAddress}. Confirm that the active wallet extension is connected to this account.`);
  const rpcUrl = env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [signedTransaction, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }] }) });
  const body = await response.json() as { result?: string; error?: { message?: string } };
  if (!response.ok || body.error || !body.result) { const message = body.error?.message ?? `RPC submission failed (${response.status}).`; await getDb().update(swapTransactions).set({ error: message }).where(eq(swapTransactions.id, row.id)); throw new Error(message); }
  await getDb().update(swapTransactions).set({ status: 'submitted', signature: body.result, submittedAt: new Date(), error: null }).where(eq(swapTransactions.id, row.id));
  return body.result;
}

/**
 * Detached offline signing: the wallet signs only the immutable Solana message.
 * The server verifies that signature, attaches it to the original wire transaction,
 * and broadcasts those exact reviewed bytes.
 */
export async function submitDetachedSwapSignature(userId: string, id: string, messageSignature: string) {
  const [row] = await getDb().select().from(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId))).limit(1);
  if (!row) throw new Error('Swap transaction not found.');
  if (row.status !== 'awaiting_signature') throw new Error(`This transaction is already ${row.status}.`);
  if (row.expiresAt <= new Date()) throw new Error('This transaction expired. Request a fresh quote and transaction.');
  if (Date.now() - row.createdAt.getTime() > 45_000) throw new Error('This signing payload is no longer current. Refresh the quote, review the new transaction, then sign it.');
  const rawTransaction = attachDetachedSignature(row.serializedTransaction, Buffer.from(messageSignature, 'base64'), row.walletAddress);
  const rpcUrl = env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [rawTransaction, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }] }) });
  const body = await response.json() as { result?: string; error?: { message?: string } };
  if (!response.ok || body.error || !body.result) { const message = body.error?.message ?? `RPC submission failed (${response.status}).`; await getDb().update(swapTransactions).set({ error: message }).where(eq(swapTransactions.id, row.id)); throw new Error(message); }
  await getDb().update(swapTransactions).set({ status: 'submitted', signature: body.result, submittedAt: new Date(), error: null }).where(eq(swapTransactions.id, row.id));
  return body.result;
}


/** Requotes an old pending item without extending its five-minute review window. */
export async function refreshSwapForUser(userId: string, id: string) {
  const [row] = await getDb().select({ id: swapTransactions.id, summary: swapTransactions.summary, status: swapTransactions.status, expiresAt: swapTransactions.expiresAt })
    .from(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId))).limit(1);
  if (!row) throw new Error('Swap transaction not found.');
  if (row.status !== 'awaiting_signature') throw new Error(`Only an unsigned transaction can be refreshed; this one is ${row.status}.`);
  if (row.expiresAt <= new Date()) throw new Error('This transaction expired. Request a fresh quote and transaction.');
  const summary = JSON.parse(row.summary) as Partial<SigningSummary>;
  if (!summary.inputToken || !summary.outputToken || !summary.inputAmount || !summary.slippageBps) throw new Error('The saved swap details are incomplete. Request a fresh quote and transaction.');
  const refreshed = await createSwapForUser(userId, { inputToken: summary.inputToken, outputToken: summary.outputToken, amount: summary.inputAmount, slippageBps: summary.slippageBps });
  await getDb().delete(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId), eq(swapTransactions.status, 'awaiting_signature')));
  return refreshed;
}
