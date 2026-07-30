import { signOut } from '@/auth';
import { Cable, Database, Wrench } from 'lucide-react';

type Area = 'connections' | 'tools' | 'pages';
const items = [
  { id: 'connections' as const, href: '/', label: 'Connections', Icon: Cable },
  { id: 'tools' as const, href: '/tools', label: 'Tool list', Icon: Wrench },
  { id: 'pages' as const, href: '/pages', label: 'Data · Pages', Icon: Database },
];

export function AppShell({ active, name, children }: { active: Area; name?: string | null; children: React.ReactNode }) {
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><aside className="sidebar"><a className="brand" href="/">mcp<span>buddy</span></a><nav aria-label="Application navigation">{items.map(({ id, href, label, Icon }) => <a key={id} className={active === id ? 'active' : ''} href={href}><Icon size={17} strokeWidth={1.8} />{label}</a>)}</nav><div className="sidebar-bottom"><div className="identity"><span>{name?.slice(0, 1).toUpperCase() ?? 'U'}</span><small>{name ?? 'MCPBuddy user'}</small></div><form action={async () => { 'use server'; await signOut(); }}><button className="signout" type="submit">Sign out</button></form></div></aside><main className="app-main" id="main-content">{children}</main></div>;
}
