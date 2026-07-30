import { GROK_REDIRECT } from '@/lib/oauth';
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const valid = body?.redirect_uris?.length === 1 && body.redirect_uris[0] === GROK_REDIRECT && body.token_endpoint_auth_method === 'none' && body?.grant_types?.every((g: string) => ['authorization_code', 'refresh_token'].includes(g)) && body?.response_types?.every((r: string) => r === 'code');
  if (!valid) return Response.json({ error: 'invalid_client_metadata', error_description: 'Only the official Grok PKCE callback is accepted.' }, { status: 400 });
  return Response.json({ client_id: 'grok', client_id_issued_at: Math.floor(Date.now() / 1000), client_name: 'Grok', redirect_uris: [GROK_REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }, { status: 201 });
}
