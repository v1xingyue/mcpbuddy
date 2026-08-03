import { z } from 'zod';
import { provisionUser } from '@/app/actions';
import { refreshSwapForUser } from '@/lib/solana-swap';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await provisionUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new Error('Invalid swap transaction id.');
    const result = await refreshSwapForUser(user.id, id);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not refresh swap.' }, { status: 400 });
  }
}
