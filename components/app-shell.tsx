import { signOut } from '@/auth';
import { Cable, Database, Settings2, Wrench } from 'lucide-react';
import Link from 'next/link';

type Area = 'connections' | 'tools' | 'pages' | 'account';
const items = [
  { id: 'connections' as const, href: '/', label: 'Connections', Icon: Cable },
  { id: 'tools' as const, href: '/tools', label: 'Tool list', Icon: Wrench },
  { id: 'pages' as const, href: '/pages', label: 'Data · Pages', Icon: Database },
  { id: 'account' as const, href: '/account', label: 'Account', Icon: Settings2 },
];

export function AppShell({ active, name, children }: { active: Area; name?: string | null; children: React.ReactNode }) {
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><aside className="sidebar"><Link className="brand" href="/">mcp<span>buddy</span></Link><nav aria-label="Application navigation">{items.map(({ id, href, label, Icon }) => <Link key={id} className={active === id ? 'active' : ''} href={href}><Icon size={17} strokeWidth={1.8} />{label}</Link>)}</nav><div className="sidebar-bottom"><div className="identity"><span>{name?.slice(0, 1).toUpperCase() ?? 'U'}</span><small>{name ?? 'MCPBuddy user'}</small></div><form action={async () => { 'use server'; await signOut(); }}><button className="signout" type="submit">Sign out</button></form></div></aside><main className="app-main" id="main-content">{children}</main></div>;
}
