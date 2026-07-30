import { consume, issueToken, pkceS256, verifyToken } from '@/lib/oauth';
import { publicOrigin } from '@/lib/config';

function form(response: Record<string, unknown>, status = 200) { return Response.json(response, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function POST(request: Request) {
  const data = await request.formData(); const grant = data.get('grant_type'); const origin = publicOrigin(request);
  try {
    if (grant === 'authorization_code') {
      const code = await verifyToken(String(data.get('code') ?? ''), origin, 'code');
      if (data.get('client_id') !== code.client_id || data.get('redirect_uri') !== code.redirect_uri || !data.get('code_verifier') || await pkceS256(String(data.get('code_verifier'))) !== code.code_challenge) return form({ error: 'invalid_grant' }, 400);
      await consume('code', code.jti);
      const access_token = await issueToken(origin, { typ: 'access_token', sub: code.sub, client_id: code.client_id, scope: code.scope }, '1h');
      const response: Record<string, string | number> = { access_token, token_type: 'Bearer', expires_in: 3600, scope: code.scope };
      if (code.scope.split(' ').includes('offline_access')) response.refresh_token = await issueToken(origin, { typ: 'refresh_token', sub: code.sub, client_id: code.client_id, scope: code.scope }, '30d');
      return form(response);
    }
    if (grant === 'refresh_token') {
      const refresh = await verifyToken(String(data.get('refresh_token') ?? ''), origin, 'refresh_token');
      if (data.get('client_id') !== refresh.client_id) return form({ error: 'invalid_grant' }, 400);
      await consume('refresh', refresh.jti);
      return form({ access_token: await issueToken(origin, { typ: 'access_token', sub: refresh.sub, client_id: refresh.client_id, scope: refresh.scope }, '1h'), refresh_token: await issueToken(origin, { typ: 'refresh_token', sub: refresh.sub, client_id: refresh.client_id, scope: refresh.scope }, '30d'), token_type: 'Bearer', expires_in: 3600, scope: refresh.scope });
    }
    return form({ error: 'unsupported_grant_type' }, 400);
  } catch { return form({ error: 'invalid_grant' }, 400); }
}
