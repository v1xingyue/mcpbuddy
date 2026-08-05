import { describe, expect, it } from 'vitest';
import { registerMcpTools } from '@/app/api/mcp/route';

describe('MCP registration catalog', () => {
  it('discovers dashboard tools from the same registrations used by the MCP endpoint', () => {
    const names: string[] = [];
    registerMcpTools({
      tool: (name: string) => names.push(name),
      registerTool: (name: string) => names.push(name),
      registerResource: () => undefined,
    });
    expect(names).toEqual(expect.arrayContaining([
      'hello', 'user_info', 'publish_page', 'publish_html',
      'list_xstocks_public_operations', 'get_xstocks_public_data',
    ]));
  });
});
