import type { z } from 'zod';

/** Small, explicit contract shared by independently maintained MCP tool packages. */
// mcp-handler provides a generic McpServer whose callback overloads cannot be
// faithfully represented without exposing its internal request types. Keep the
// adapter boundary opaque; each package still owns only its registrations.
export type McpToolServer = any;

export type McpPluginContext = {
  currentUser: (accountId: unknown) => Promise<{ id: string }>;
  reviewUiUri: string;
  reviewUi: string;
  reviewOutputSchema: Record<string, z.ZodTypeAny>;
  transactionStatusOutputSchema: Record<string, z.ZodTypeAny>;
  appOrigin: () => string;
};
