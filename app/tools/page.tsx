import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { provisionUserForSession } from '@/app/actions';
import { AppShell } from '@/components/app-shell';
import { DashboardTools } from '@/components/dashboard-tools';
import { getDb } from '@/lib/db';
import { toolPluginSettings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { mcpToolCatalog } from '@/lib/mcp/tool-catalog';

export default async function ToolsPage() {
  const session = await auth(); if (!session?.user) redirect('/');
  const user = await provisionUserForSession(session); if (!user) redirect('/');
  const [xstocks] = await getDb().select({ enabled: toolPluginSettings.enabled }).from(toolPluginSettings).where(and(eq(toolPluginSettings.userId, user.id), eq(toolPluginSettings.pluginId, 'xstocks/public'))).limit(1);
  return <AppShell active="tools" name={user.name ?? user.email}><header className="app-page-head"><p className="eyebrow">MCP CAPABILITIES</p><h1>Tool list</h1><p>Tools available to each connected AI client.</p></header><DashboardTools plugins={mcpToolCatalog()} xstocksEnabled={xstocks?.enabled ?? true} /></AppShell>;
}
