import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { toolPluginSettings } from '@/lib/db/schema';
import { getXstocksPublicData, xstocksPublicOperationSchema, xstocksPublicOperations } from '@/lib/xstocks';
import type { McpPluginContext, McpToolServer } from '@/lib/mcp/plugins/types';

/** xStocks API v2 public data. No API key, wallet capability, or trade action is exposed. */
async function xstocksEnabledForUser(userId: string) {
  const [setting] = await getDb().select({ enabled: toolPluginSettings.enabled }).from(toolPluginSettings)
    .where(and(eq(toolPluginSettings.userId, userId), eq(toolPluginSettings.pluginId, 'xstocks/public'))).limit(1);
  return setting?.enabled ?? true;
}

export function registerXstocksPublicPlugin(server: McpToolServer, context: McpPluginContext) {
  server.registerTool('list_xstocks_public_operations', {
    title: 'List xStocks public operations',
    description: 'List every unauthenticated xStocks API v2 operation available through MCPBuddy.',
    inputSchema: {},
    outputSchema: { operations: z.array(z.object({ id: z.string(), path: z.string(), description: z.string(), requiresSymbol: z.boolean() })) },
  }, async (_args: unknown, extra: any) => {
    const user = await context.currentUser(extra.authInfo?.extra?.githubId);
    if (!await xstocksEnabledForUser(user.id)) return { content: [{ type: 'text', text: 'xStocks public tools are disabled for this MCPBuddy account. Enable them in Tool list.' }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify({ operations: xstocksPublicOperations }) }], structuredContent: { operations: xstocksPublicOperations } };
  });

  server.registerTool('get_xstocks_public_data', {
    title: 'Get xStocks public data',
    description: 'Call one documented unauthenticated xStocks API v2 data operation. This tool is read-only and cannot trade, issue, redeem, bridge, whitelist wallets, or use an API key.',
    inputSchema: { operation: xstocksPublicOperationSchema, symbol: z.string().trim().regex(/^[A-Za-z0-9._-]{1,32}$/).optional(), query: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/), z.string().trim().min(1).max(120)).optional() },
    outputSchema: { operation: z.string(), data: z.unknown(), fetchedAt: z.string().datetime() },
  }, async (args: any, extra: any) => {
    try {
      const user = await context.currentUser(extra.authInfo?.extra?.githubId);
      if (!await xstocksEnabledForUser(user.id)) return { content: [{ type: 'text', text: 'xStocks public tools are disabled for this MCPBuddy account. Enable them in Tool list.' }], isError: true };
      const result = await getXstocksPublicData(args); return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    }
    catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not retrieve xStocks public data.' }], isError: true }; }
  });
}
