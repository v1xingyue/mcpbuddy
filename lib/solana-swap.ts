import { createHash } from 'crypto';
import { PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { swapTransactions, walletBindings } from '@/lib/db/schema';
import { env } from '@/lib/config';
import { solanaSwapTokens } from '@/lib/solana-assets';

const JUPITER = 'https://api.jup.ag/swap/v1';
type JupiterQuote = { inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold: string; priceImpactPct?: string; routePlan?: Array<{ swapInfo?: { label?: string } }> };
type JupiterSwapBuild = { swapTransaction?: string; simulationError?: { errorCode?: string; error?: string } | string };
type SigningSummary = { kind: 'swap' | 'transfer'; inputToken: string; outputToken: string; inputMint: string; outputMint: string; inputAmount: string; inputAmountAtomic: string; expectedOutputAtomic: string; minimumOutputAtomic: string; slippageBps: number; priceImpactPct: string | null; route: string[]; recipient?: string; feePayer: string; requiredSigners: string[]; instructionProgramIds: string[]; transactionDigest: string };
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
let quoteableTokenCache: { expiresAt: number; tokens: typeof solanaSwapTokens } | null = null;

function headers(): Record<string, string> { if (!env.JUPITER_API_KEY) throw new Error('JUPITER_API_KEY is required for Jupiter Swap API v1. Configure it server-side before creating a swap.'); return { 'x-api-key': env.JUPITER_API_KEY }; }
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
  if (!found) {
    try {
      new PublicKey(symbol);
      throw new Error(`Warning: "${symbol}" looks like a Solana Mint address, but create_solana_swap accepts token symbols only. Use create_solana_swap_by_mint(inputMint, outputMint, amount) instead; its amount must be an atomic integer (for example, 0.5 USDC = "500000").`);
    } catch (error) { if (error instanceof Error && error.message.startsWith('Warning:')) throw error; }
    throw new Error(`Unsupported token "${symbol}". Call list_solana_swap_tokens first and use one of its returned symbols, or use create_solana_swap_by_mint for arbitrary Mint addresses.`);
  }
  return found;
}

/** Returns only configured assets quoteable from the supplied input token and amount. */
export async function quoteableSolanaSwapTokens(inputSymbol = 'USDC', inputAmount = '1') {
  const input = token(inputSymbol);
  const amount = toAtomicAmount(inputAmount, input.decimals);
  const cacheKey = `${input.symbol}:${amount}`;
  if (quoteableTokenCache && quoteableTokenCache.expiresAt > Date.now() && (quoteableTokenCache as typeof quoteableTokenCache & { key?: string }).key === cacheKey) return quoteableTokenCache.tokens;
  const requestHeaders = headers();
  const results = await Promise.all(solanaSwapTokens.map(async asset => {
    if (asset.mint === input.mint) return asset;
    const query = new URLSearchParams({ inputMint: input.mint, outputMint: asset.mint, amount, slippageBps: '50' });
    try {
      const response = await fetch(`${JUPITER}/quote?${query}`, { headers: requestHeaders, cache: 'no-store' });
      if (!response.ok) return null;
      const quote = await response.json() as Partial<JupiterQuote>;
      return quote.outAmount && BigInt(quote.outAmount) > 0n ? asset : null;
    } catch { return null; }
  }));
  const tokens = results.filter((asset): asset is (typeof solanaSwapTokens)[number] => Boolean(asset)).filter((asset, index, all) => all.findIndex(candidate => candidate.mint === asset.mint) === index);
  if (!tokens.some(asset => asset.mint === input.mint)) throw new Error(`Jupiter quote validation returned no ${input.symbol} route. Check JUPITER_API_KEY and Jupiter API availability.`);
  quoteableTokenCache = { tokens, expiresAt: Date.now() + 5 * 60_000 } as typeof quoteableTokenCache;
  (quoteableTokenCache as typeof quoteableTokenCache & { key: string }).key = cacheKey;
  return tokens;
}

export function toAtomicAmount(value: string, decimals: number) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('amount must be a positive decimal string, for example "0.1" or "25".');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`amount has more than ${decimals} decimal places for this token.`);
  const atomic = BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
  if (atomic <= 0n) throw new Error('amount must be greater than zero.');
  return atomic.toString();
}

async function rpc<T>(method: string, params: unknown[]) {
  const response = await fetch(env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await response.json() as { result?: T; error?: { message?: string } };
  if (!response.ok || body.error || body.result === undefined) throw new Error(body.error?.message ?? `Solana RPC ${method} failed (${response.status}).`);
  return body.result;
}

export async function createTokenTransferForUser(userId: string, args: { token: string; recipient: string; amount: string }) {
  const asset = token(args.token);
  if (asset.symbol === 'SOL') throw new Error('Use create_solana_sol_transfer for SOL. create_solana_token_transfer is for SPL tokens.');
  const amount = toAtomicAmount(args.amount, asset.decimals);
  const [wallet] = await getDb().select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, userId)).limit(1);
  if (!wallet) throw new Error('No Solana wallet is bound to this account. Bind a wallet before creating a transfer.');
  let recipient: PublicKey;
  try { recipient = new PublicKey(args.recipient); } catch { throw new Error('recipient must be a valid Solana wallet address.'); }
  const mint = new PublicKey(asset.mint);
  type TokenAccounts = { value: Array<{ pubkey: string; account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }> };
  const [source, destination, blockhash] = await Promise.all([
    rpc<TokenAccounts>('getTokenAccountsByOwner', [wallet.address, { mint: mint.toBase58() }, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
    rpc<TokenAccounts>('getTokenAccountsByOwner', [recipient.toBase58(), { mint: mint.toBase58() }, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
    rpc<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]),
  ]);
  const sourceAccount = source.value.find(item => BigInt(item.account.data.parsed.info.tokenAmount.amount) >= BigInt(amount));
  if (!sourceAccount) throw new Error(`Insufficient ${asset.symbol} balance in a token account.`);
  const destinationAccount = destination.value[0];
  if (!destinationAccount) throw new Error(`Recipient does not have a ${asset.symbol} token account. Ask them to receive ${asset.symbol} once before retrying.`);
  const data = Buffer.alloc(10); data[0] = 12; data.writeBigUInt64LE(BigInt(amount), 1); data[9] = asset.decimals;
  const instruction = new TransactionInstruction({ programId: TOKEN_PROGRAM_ID, keys: [{ pubkey: new PublicKey(sourceAccount.pubkey), isSigner: false, isWritable: true }, { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: new PublicKey(destinationAccount.pubkey), isSigner: false, isWritable: true }, { pubkey: new PublicKey(wallet.address), isSigner: true, isWritable: false }], data });
  const serializedTransaction = Buffer.from(new VersionedTransaction(new TransactionMessage({ payerKey: new PublicKey(wallet.address), recentBlockhash: blockhash.value.blockhash, instructions: [instruction] }).compileToV0Message()).serialize()).toString('base64');
  const details = inspect(serializedTransaction);
  const summary: SigningSummary = { kind: 'transfer', inputToken: asset.symbol, outputToken: asset.symbol, inputMint: mint.toBase58(), outputMint: mint.toBase58(), inputAmount: args.amount, inputAmountAtomic: amount, expectedOutputAtomic: amount, minimumOutputAtomic: amount, slippageBps: 0, priceImpactPct: null, route: [], recipient: recipient.toBase58(), ...details };
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const [row] = await getDb().insert(swapTransactions).values({ userId, walletAddress: wallet.address, serializedTransaction, messageBase64: details.messageBase64, transactionDigest: details.transactionDigest, summary: JSON.stringify(summary), expiresAt }).returning({ id: swapTransactions.id });
  return { transactionId: row.id, expiresAt: expiresAt.toISOString(), summary };
}

export async function createSwapForUser(userId: string, args: { inputToken: string; outputToken: string; amount: string; slippageBps: number }) {
  const input = token(args.inputToken); const output = token(args.outputToken);
  if (input.mint === output.mint) throw new Error('Choose two different tokens.');
  const amount = toAtomicAmount(args.amount, input.decimals);
  if (!Number.isInteger(args.slippageBps) || args.slippageBps < 1 || args.slippageBps > 1_000) throw new Error('slippageBps must be an integer from 1 to 1000.');
  const [wallet] = await getDb().select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, userId)).limit(1);
  if (!wallet) throw new Error('No Solana wallet is bound to this account. Bind a wallet before creating a swap.');
  // v0 is Jupiter's preferred transaction format: address lookup tables keep
  // complex routes within the transaction size limit. The signed v0 message is
  // immutable and must be returned byte-for-byte by the wallet.
  const query = new URLSearchParams({ inputMint: input.mint, outputMint: output.mint, amount, slippageBps: String(args.slippageBps) });
  const quoteResponse = await fetch(`${JUPITER}/quote?${query}`, { headers: headers(), cache: 'no-store' });
  if (!quoteResponse.ok) { const detail = (await quoteResponse.text()).slice(0, 2_000); throw new Error(`Jupiter quote failed (${quoteResponse.status}) for inputMint=${input.mint}, outputMint=${output.mint}, amount=${amount}, slippageBps=${args.slippageBps}.${detail ? ` Response: ${detail}` : ''}`); }
  const quote = await quoteResponse.json() as JupiterQuote;
  const buildResponse = await fetch(`${JUPITER}/swap`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers() }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, blockhashSlotsToExpiry: 150 }) });
  if (!buildResponse.ok) { const detail = (await buildResponse.text()).slice(0, 2_000); throw new Error(`Jupiter transaction build failed (${buildResponse.status}).${detail ? ` Response: ${detail}` : ''}`); }
  const built = await buildResponse.json() as JupiterSwapBuild;
  if (built.simulationError) { const detail = typeof built.simulationError === 'string' ? built.simulationError : `${built.simulationError.errorCode ?? 'SIMULATION_ERROR'}: ${built.simulationError.error ?? 'Unknown simulation error.'}`; throw new Error(`Jupiter built a transaction that failed simulation: ${detail}`); }
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

/** Generic Jupiter swap path for callers that already know token mints. `amount` is atomic. */
export async function createSwapByMintForUser(userId: string, args: { inputMint: string; outputMint: string; amount: string; slippageBps: number }) {
  if (!/^\d+$/.test(args.amount) || BigInt(args.amount) <= 0n) throw new Error('amount must be a positive atomic integer string. For example, 0.5 USDC is "500000".');
  let inputMint: PublicKey; let outputMint: PublicKey;
  try { inputMint = new PublicKey(args.inputMint); outputMint = new PublicKey(args.outputMint); } catch { throw new Error('inputMint and outputMint must be valid Solana mint addresses.'); }
  if (inputMint.equals(outputMint)) throw new Error('Choose two different token mints.');
  if (!Number.isInteger(args.slippageBps) || args.slippageBps < 1 || args.slippageBps > 1_000) throw new Error('slippageBps must be an integer from 1 to 1000.');
  const [wallet] = await getDb().select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, userId)).limit(1);
  if (!wallet) throw new Error('No Solana wallet is bound to this account. Bind a wallet before creating a swap.');
  const query = new URLSearchParams({ inputMint: inputMint.toBase58(), outputMint: outputMint.toBase58(), amount: args.amount, slippageBps: String(args.slippageBps) });
  const quoteResponse = await fetch(`${JUPITER}/quote?${query}`, { headers: headers(), cache: 'no-store' });
  if (!quoteResponse.ok) { const detail = (await quoteResponse.text()).slice(0, 2_000); throw new Error(`Jupiter quote failed (${quoteResponse.status}) for inputMint=${inputMint}, outputMint=${outputMint}, amount=${args.amount}.${detail ? ` Response: ${detail}` : ''}`); }
  const quote = await quoteResponse.json() as JupiterQuote;
  const buildResponse = await fetch(`${JUPITER}/swap`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers() }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, blockhashSlotsToExpiry: 150 }) });
  if (!buildResponse.ok) { const detail = (await buildResponse.text()).slice(0, 2_000); throw new Error(`Jupiter transaction build failed (${buildResponse.status}).${detail ? ` Response: ${detail}` : ''}`); }
  const built = await buildResponse.json() as JupiterSwapBuild; if (built.simulationError) { const detail = typeof built.simulationError === 'string' ? built.simulationError : `${built.simulationError.errorCode ?? 'SIMULATION_ERROR'}: ${built.simulationError.error ?? 'Unknown simulation error.'}`; throw new Error(`Jupiter built a transaction that failed simulation: ${detail}`); } if (!built.swapTransaction) throw new Error('Jupiter did not return a transaction to sign.');
  const details = inspect(built.swapTransaction); if (details.feePayer !== wallet.address || !details.requiredSigners.includes(wallet.address)) throw new Error('Rejected a transaction whose required fee payer does not match the bound wallet.');
  const short = (mint: string) => `${mint.slice(0, 5)}…${mint.slice(-4)}`;
  const summary: SigningSummary = { kind: 'swap', inputToken: short(inputMint.toBase58()), outputToken: short(outputMint.toBase58()), inputMint: quote.inputMint, outputMint: quote.outputMint, inputAmount: args.amount, inputAmountAtomic: quote.inAmount, expectedOutputAtomic: quote.outAmount, minimumOutputAtomic: quote.otherAmountThreshold, slippageBps: args.slippageBps, priceImpactPct: quote.priceImpactPct ?? null, route: [...new Set((quote.routePlan ?? []).map(item => item.swapInfo?.label).filter((label): label is string => Boolean(label)))], ...details };
  const expiresAt = new Date(Date.now() + 5 * 60_000); const [row] = await getDb().insert(swapTransactions).values({ userId, walletAddress: wallet.address, serializedTransaction: built.swapTransaction, messageBase64: details.messageBase64, transactionDigest: details.transactionDigest, summary: JSON.stringify(summary), expiresAt }).returning({ id: swapTransactions.id });
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

export async function submitSignedSwap(userId: string, id: string, signedTransaction: string, preSignTransaction: string) {
  const [row] = await getDb().select().from(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId))).limit(1);
  if (!row) throw new Error('Swap transaction not found.');
  if (row.status !== 'awaiting_signature') throw new Error(`This transaction is already ${row.status}.`);
  if (row.expiresAt <= new Date()) throw new Error('This transaction expired. Request a fresh quote and transaction.');
  if (Date.now() - row.createdAt.getTime() > 45_000) throw new Error('This signing payload is no longer current. Refresh the quote, review the new transaction, then sign it.');
  const reviewedMessage = wireMessage(row.serializedTransaction);
  if (!Buffer.from(wireMessage(preSignTransaction)).equals(reviewedMessage)) {
    throw new Error(`Rejected before wallet signing: the browser loaded a different transaction than pending item ${id}. This is a stale-page or transaction-ID mismatch; refresh the account page, then open the new review link.`);
  }
  // Compatibility mode: broadcast the exact signed transaction returned by the
  // wallet. We deliberately do not compare its post-signing message with the
  // reviewed v0 message; see docs/solana-offline-signing.md for the risk.
  const rpcUrl = env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [signedTransaction, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }] }) });
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
  if (summary.kind === 'transfer') {
    if (!summary.inputToken || !summary.inputAmount || !summary.recipient) throw new Error('The saved transfer details are incomplete. Create a fresh transfer.');
    const refreshed = await createTokenTransferForUser(userId, { token: summary.inputToken, amount: summary.inputAmount, recipient: summary.recipient });
    await getDb().delete(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId), eq(swapTransactions.status, 'awaiting_signature')));
    return refreshed;
  }
  if (!summary.inputToken || !summary.outputToken || !summary.inputAmount || !summary.slippageBps) throw new Error('The saved swap details are incomplete. Request a fresh quote and transaction.');
  const refreshed = await createSwapForUser(userId, { inputToken: summary.inputToken, outputToken: summary.outputToken, amount: summary.inputAmount, slippageBps: summary.slippageBps });
  await getDb().delete(swapTransactions).where(and(eq(swapTransactions.id, id), eq(swapTransactions.userId, userId), eq(swapTransactions.status, 'awaiting_signature')));
  return refreshed;
}
