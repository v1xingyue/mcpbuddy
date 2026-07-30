import { oauthMetadata } from '@/lib/oauth';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return Response.json(oauthMetadata(request)); }
