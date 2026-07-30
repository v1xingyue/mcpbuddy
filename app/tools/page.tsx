import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { provisionUserForSession } from '@/app/actions';
import { AppShell } from '@/components/app-shell';
import { DashboardTools } from '@/components/dashboard-tools';

export default async function ToolsPage() {
  const session = await auth(); if (!session?.user) redirect('/');
  const user = await provisionUserForSession(session); if (!user) redirect('/');
  return <AppShell active="tools" name={user.name ?? user.email}><header className="app-page-head"><p className="eyebrow">MCP CAPABILITIES</p><h1>Tool list</h1><p>Tools available to each connected AI client.</p></header><DashboardTools /></AppShell>;
}
