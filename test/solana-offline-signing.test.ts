import { describe, expect, it } from 'vitest';
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { validateReviewedSignedTransaction } from '@/lib/solana-swap';

function unsignedTransaction(payer = Keypair.generate()) {
  const recipient = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient.publicKey, lamports: 1 })],
  }).compileToV0Message();
  return { payer, transaction: new VersionedTransaction(message) };
}

describe('reviewed Solana transaction signing', () => {
  it('accepts a wallet signature for the exact reviewed message', () => {
    const { payer, transaction } = unsignedTransaction();
    const unsigned = Buffer.from(transaction.serialize()).toString('base64');
    transaction.sign([payer]);
    const signed = Buffer.from(transaction.serialize()).toString('base64');
    expect(() => validateReviewedSignedTransaction(unsigned, signed, payer.publicKey.toBase58())).not.toThrow();
  });

  it('rejects a signature from a wallet other than the reviewed fee payer', () => {
    const { payer, transaction } = unsignedTransaction();
    const unsigned = Buffer.from(transaction.serialize()).toString('base64');
    transaction.signatures[0] = nacl.sign.detached(transaction.message.serialize(), Keypair.generate().secretKey);
    const signed = Buffer.from(transaction.serialize()).toString('base64');
    expect(() => validateReviewedSignedTransaction(unsigned, signed, payer.publicKey.toBase58())).toThrow('does not verify');
  });

  it('rejects a signed transaction with a changed reviewed message', () => {
    const { payer, transaction } = unsignedTransaction();
    const reviewed = Buffer.from(transaction.serialize()).toString('base64');
    const other = unsignedTransaction(payer).transaction;
    other.sign([payer]);
    const signed = Buffer.from(other.serialize()).toString('base64');
    expect(() => validateReviewedSignedTransaction(reviewed, signed, payer.publicKey.toBase58())).toThrow('message differs');
  });
});
