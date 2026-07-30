import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { publicOrigin } from '@/lib/config';
import { verifyToken as verifyOAuthToken } from '@/lib/oauth';

/** Converts an MCPBuddy OAuth bearer token into the auth context expected by MCP SDK. */
export async function verifyMcpToken(request: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  try {
    const token = await verifyOAuthToken(bearerToken, publicOrigin(request), 'access_token');
    return {
      token: bearerToken,
      clientId: token.client_id,
      scopes: token.scope.split(' ').filter(Boolean),
      extra: { githubId: token.sub },
    };
  } catch {
    return undefined;
  }
}
