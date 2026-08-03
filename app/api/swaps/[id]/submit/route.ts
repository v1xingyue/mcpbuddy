import { z } from 'zod';
import { provisionUser } from '@/app/actions';
import { submitDetachedSwapSignature, submitSignedSwap } from '@/lib/solana-swap';
import { deletePendingSwap } from '@/lib/solana-swap';

const bodySchema = z.union([
  z.object({ messageSignature: z.string().min(80).max(120) }),
  z.object({ signedTransaction: z.string().min(20), preSignTransaction: z.string().min(20) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await provisionUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = bodySchema.parse(await request.json());
    const { id } = await params;
    const signature = 'messageSignature' in body
      ? await submitDetachedSwapSignature(user.id, id, body.messageSignature)
      : await submitSignedSwap(user.id, id, body.signedTransaction, body.preSignTransaction);
    return Response.json({ signature });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not submit swap.' }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await provisionUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new Error('Invalid swap transaction id.');
    await deletePendingSwap(user.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not delete swap.' }, { status: 400 });
  }
}
