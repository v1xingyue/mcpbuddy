import { auth } from '@/auth';
import { issueToken, supportedScopes, validateClient } from '@/lib/oauth';
import { publicOrigin } from '@/lib/config';

export async function GET(request: Request) {
  const session = await auth();
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const challenge = url.searchParams.get('code_challenge');
  const method = url.searchParams.get('code_challenge_method');
  const state = url.searchParams.get('state');
  const requestedScope = (url.searchParams.get('scope') ?? 'mcp:tools').split(' ');
  // Use the provider picker so GitHub and Google accounts can complete MCP OAuth.
  if (!session?.user?.id) return Response.redirect(new URL(`/api/auth/signin?callbackUrl=${encodeURIComponent(url.toString())}`, url.origin));
  if (!clientId || !redirectUri || !challenge || method !== 'S256' || !state || requestedScope.some(s => !supportedScopes.includes(s))) return Response.json({ error: 'invalid_request' }, { status: 400 });
  try { validateClient(clientId, redirectUri); } catch { return Response.json({ error: 'invalid_client' }, { status: 400 }); }
  const origin = publicOrigin(request);
  const code = await issueToken(origin, { typ: 'code', sub: session.user.id, client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, scope: requestedScope.join(' ') }, '5m');
  const callback = new URL(redirectUri);
  callback.searchParams.set('code', code); callback.searchParams.set('state', state);
  return Response.redirect(callback);
}
