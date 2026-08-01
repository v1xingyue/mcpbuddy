import { createHash } from 'crypto';
import { VersionedTransaction } from '@solana/web3.js';
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
function inspect(serialized: string) {
  const transaction = VersionedTransaction.deserialize(Buffer.from(serialized, 'base64'));
  const message = transaction.message.serialize(); const keys = transaction.message.staticAccountKeys;
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
  const buildResponse = await fetch(`${JUPITER}/swap`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers() }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true }) });
  if (!buildResponse.ok) throw new Error(`Jupiter transaction build failed (${buildResponse.status}).`);
  const built = await buildResponse.json() as { swapTransaction?: string };
  if (!built.swapTransaction) throw new Error('Jupiter did not return a transaction to sign.');
  const details = inspect(built.swapTransaction);
  if (details.feePayer !== wallet.address || !details.requiredSigners.includes(wallet.address)) throw new Error('Rejected a transaction whose required fee payer does not match the bound wallet.');
  const summary: SigningSummary = { kind: 'swap', inputToken: input.symbol, outputToken: output.symbol, inputMint: quote.inputMint, outputMint: quote.outputMint, inputAmount: args.amount, inputAmountAtomic: quote.inAmount, expectedOutputAtomic: quote.outAmount, minimumOutputAtomic: quote.otherAmountThreshold, slippageBps: args.slippageBps, priceImpactPct: quote.priceImpactPct ?? null, route: [...new Set((quote.routePlan ?? []).map(item => item.swapInfo?.label).filter((label): label is string => Boolean(label)))], ...details };
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const [row] = await getDb().insert(swapTransactions).values({ userId, walletAddress: wallet.address, serializedTransaction: built.swapTransaction, messageBase64: details.messageBase64, transactionDigest: details.transactionDigest, summary: JSON.stringify(summary), expiresAt }).returning({ id: swapTransactions.id });
  return { transactionId: row.id, expiresAt: expiresAt.toISOString(), summary };
}

export async function pendingSwapsForUser(userId: string) {
  return getDb().select({ id: swapTransactions.id, serializedTransaction: swapTransactions.serializedTransaction, summary: swapTransactions.summary, status: swapTransactions.status, expiresAt: swapTransactions.expiresAt, createdAt: swapTransactions.createdAt }).from(swapTransactions).where(and(eq(swapTransactions.userId, userId), eq(swapTransactions.status, 'awaiting_signature')));
}

export async function submitSignedSwap(userId: string, id: string, signedTransaction: string) {
  const [row] = await getDb().select().from(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId))).limit(1);
  if (!row) throw new Error('Swap transaction not found.');
  if (row.status !== 'awaiting_signature') throw new Error(`This transaction is already ${row.status}.`);
  if (row.expiresAt <= new Date()) throw new Error('This transaction expired. Request a fresh quote and transaction.');
  const signed = VersionedTransaction.deserialize(Buffer.from(signedTransaction, 'base64'));
  if (Buffer.from(signed.message.serialize()).toString('base64') !== row.messageBase64) throw new Error('Rejected: signed transaction message differs from the reviewed transaction.');
  if (!signed.signatures.some(signature => signature.some(byte => byte !== 0))) throw new Error('The wallet did not add a signature.');
  const rpcUrl = env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [signedTransaction, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }] }) });
  const body = await response.json() as { result?: string; error?: { message?: string } };
  if (!response.ok || body.error || !body.result) { const message = body.error?.message ?? `RPC submission failed (${response.status}).`; await getDb().update(swapTransactions).set({ error: message }).where(eq(swapTransactions.id, row.id)); throw new Error(message); }
  await getDb().update(swapTransactions).set({ status: 'submitted', signature: body.result, submittedAt: new Date(), error: null }).where(eq(swapTransactions.id, row.id));
  return body.result;
}
