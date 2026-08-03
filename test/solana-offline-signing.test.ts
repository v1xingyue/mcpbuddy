import { describe, expect, it } from 'vitest';
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { attachDetachedSignature } from '@/lib/solana-swap';

function unsignedTransaction() {
  const payer = Keypair.generate();
  const recipient = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient.publicKey, lamports: 1 })],
  }).compileToV0Message();
  return { payer, transaction: new VersionedTransaction(message) };
}

describe('detached Solana transaction signing', () => {
  it('attaches only a verified signature to the original reviewed wire transaction', () => {
    const { payer, transaction } = unsignedTransaction();
    const unsigned = Buffer.from(transaction.serialize()).toString('base64');
    const signature = nacl.sign.detached(transaction.message.serialize(), payer.secretKey);
    const signed = attachDetachedSignature(unsigned, signature, payer.publicKey.toBase58());
    const restored = VersionedTransaction.deserialize(Buffer.from(signed, 'base64'));
    expect(Buffer.from(restored.message.serialize())).toEqual(Buffer.from(transaction.message.serialize()));
    expect(Array.from(restored.signatures[0])).toEqual(Array.from(signature));
  });

  it('rejects a signature from a wallet other than the reviewed fee payer', () => {
    const { payer, transaction } = unsignedTransaction();
    const unsigned = Buffer.from(transaction.serialize()).toString('base64');
    const wrongSignature = nacl.sign.detached(transaction.message.serialize(), Keypair.generate().secretKey);
    expect(() => attachDetachedSignature(unsigned, wrongSignature, payer.publicKey.toBase58())).toThrow('does not verify');
  });
});
