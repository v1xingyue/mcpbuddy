import { env } from '@/lib/config';

/** Vercel Cron uses this bearer secret; callers cannot trigger catalog refreshes without it. */
export function hasCronAuthorization(request: Request, secret = env.CRON_SECRET) {
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}
