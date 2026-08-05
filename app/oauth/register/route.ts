import { registerClient } from '@/lib/oauth';

const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  try { return Response.json(registerClient(body ?? {}), { status: 201, headers: cors }); }
  catch {
    // Redirect URIs are public client metadata, not credentials. Log only this field
    // so an unknown official platform callback can be added as an exact allow-list entry.
    console.info('Rejected OAuth dynamic client registration', { redirectUris: body?.redirect_uris });
    return Response.json({ error: 'invalid_client_metadata', error_description: 'The redirect URI must be an official Grok or ChatGPT Connector callback, or exactly match MCP_DEBUG_REDIRECT_URI when debug access is configured.' }, { status: 400, headers: cors });
  }
}
export function OPTIONS() { return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } }); }
