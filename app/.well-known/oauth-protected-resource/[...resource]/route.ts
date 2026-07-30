import { publicOrigin } from '@/lib/config';
import { supportedScopes } from '@/lib/oauth';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  const origin = publicOrigin(request);
  return Response.json({ resource: `${origin}/api/mcp`, authorization_servers: [origin], scopes_supported: supportedScopes, bearer_methods_supported: ['header'], resource_name: 'MCPBuddy private tools' });
}
