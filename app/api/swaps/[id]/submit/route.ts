import { z } from 'zod';
import { provisionUser } from '@/app/actions';
import { submitSignedSwap } from '@/lib/solana-swap';

const bodySchema = z.object({ signedTransaction: z.string().min(20) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await provisionUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = bodySchema.parse(await request.json());
    const { id } = await params;
    const signature = await submitSignedSwap(user.id, id, body.signedTransaction);
    return Response.json({ signature });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not submit swap.' }, { status: 400 });
  }
}
