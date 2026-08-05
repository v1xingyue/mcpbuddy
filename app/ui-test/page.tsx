import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { DashboardTools } from '@/components/dashboard-tools';
import { mcpToolCatalog } from '@/lib/mcp/tool-catalog';
import { PlatformConnections } from '@/components/platform-connections';
import { isLocalUiTestMode } from '@/lib/local-ui-test-mode';

export default function LocalUiTestCenter() {
  if (!isLocalUiTestMode()) notFound();

  return <AppShell active="connections" name="Visual test account" visualTestMode>
    <header className="app-page-head"><p className="eyebrow">LOCAL UI TEST CENTER</p><h1>Style fixtures</h1><p>Use this page for shared chrome, navigation, cards, forms, lists, and responsive layout checks without an account.</p></header>
    <PlatformConnections endpoint="https://example.test/api/mcp" connectedPlatforms={['claude', 'openai']} />
    <DashboardTools plugins={mcpToolCatalog()} />
    <section className="page-list"><div><p className="eyebrow">PAGES FIXTURE</p><h2>Typical page states.</h2></div><div><div className="page-row ui-interactive-card"><a href="#private"><span>Private product notes<small>/product-notes</small></span><b>Private →</b></a><button className="delete-page" type="button" disabled>Delete</button></div><div className="page-row ui-interactive-card"><a href="#public"><span>Public launch brief<small>/launch-brief</small></span><b>Public ↗</b></a><button className="delete-page" type="button" disabled>Delete</button></div><p className="empty-pages">Empty-state reference: no pages yet.</p></div></section>
  </AppShell>;
}
