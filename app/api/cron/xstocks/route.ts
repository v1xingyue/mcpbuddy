import { hasCronAuthorization } from '@/lib/cron';
import { refreshSolanaXstocks } from '@/lib/xstocks';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Daily Vercel Cron: fetches the large public source, then persists only compact Solana entries. */
export async function GET(request: Request) {
  if (!hasCronAuthorization(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return Response.json(await refreshSolanaXstocks(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Could not refresh xStocks catalog.' }, { status: 502 });
  }
}
