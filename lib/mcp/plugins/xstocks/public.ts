import { z } from 'zod';
import { getXstocksPublicData, xstocksPublicOperationSchema, xstocksPublicOperations } from '@/lib/xstocks';
import type { McpToolServer } from '@/lib/mcp/plugins/types';

/** xStocks API v2 public data. No API key, wallet capability, or trade action is exposed. */
export function registerXstocksPublicPlugin(server: McpToolServer) {
  server.registerTool('list_xstocks_public_operations', {
    title: 'List xStocks public operations',
    description: 'List every unauthenticated xStocks API v2 operation available through MCPBuddy.',
    inputSchema: {},
    outputSchema: { operations: z.array(z.object({ id: z.string(), path: z.string(), description: z.string(), requiresSymbol: z.boolean() })) },
  }, async () => ({ content: [{ type: 'text', text: JSON.stringify({ operations: xstocksPublicOperations }) }], structuredContent: { operations: xstocksPublicOperations } }));

  server.registerTool('get_xstocks_public_data', {
    title: 'Get xStocks public data',
    description: 'Call one documented unauthenticated xStocks API v2 data operation. This tool is read-only and cannot trade, issue, redeem, bridge, whitelist wallets, or use an API key.',
    inputSchema: { operation: xstocksPublicOperationSchema, symbol: z.string().trim().regex(/^[A-Za-z0-9._-]{1,32}$/).optional(), query: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/), z.string().trim().min(1).max(120)).optional() },
    outputSchema: { operation: z.string(), data: z.unknown(), fetchedAt: z.string().datetime() },
  }, async (args: any) => {
    try { const result = await getXstocksPublicData(args); return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }; }
    catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not retrieve xStocks public data.' }], isError: true }; }
  });
}
