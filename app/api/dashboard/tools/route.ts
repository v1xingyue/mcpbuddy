import { auth } from '@/auth';
import { provisionUserForSession } from '@/app/actions';
import { registerMcpTools } from '@/app/api/mcp/route';
import { pluginForTool } from '@/lib/mcp/tool-catalog';

type RegisteredTool = { name: string; description: string };

/** Discovers the live MCP registration surface without invoking any tool handler. */
export async function GET() {
  const session = await auth();
  if (!session?.user || !await provisionUserForSession(session)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const tools = new Map<string, RegisteredTool>();
  const record = (name: string, description: unknown) => tools.set(name, { name, description: typeof description === 'string' ? description : '' });
  registerMcpTools({
    tool: (name: string, description: string) => record(name, description),
    registerTool: (name: string, config: { description?: string }) => record(name, config.description),
    registerResource: () => undefined,
  });
  const grouped = [...tools.values()].sort((a, b) => a.name.localeCompare(b.name)).reduce<Record<string, RegisteredTool[]>>((groups, tool) => {
    const id = pluginForTool(tool.name); (groups[id] ??= []).push(tool); return groups;
  }, {});
  const plugins = Object.entries(grouped).map(([id, items]) => ({ id, label: id, category: id.split('/')[0], summary: `${items.length} tool${items.length === 1 ? '' : 's'} discovered from the live MCP registration.`, tools: items, controllable: id === 'xstocks/public' }));
  return Response.json({ plugins }, { headers: { 'Cache-Control': 'private, no-store' } });
}
