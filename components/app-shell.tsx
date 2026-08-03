import { signOut } from '@/auth';
import Link from 'next/link';
import { NavigationProgress } from '@/components/navigation-progress';
import { SidebarIdentity } from '@/components/sidebar-identity';
import { BrandLogo } from '@/components/brand-logo';
import { SidebarNavigation } from '@/components/sidebar-navigation';

type Area = 'connections' | 'tools' | 'pages' | 'account';

export function AppShell({ active, name, children }: { active: Area; name?: string | null; children: React.ReactNode }) {
  return <div className="app-shell"><NavigationProgress /><a className="skip-link" href="#main-content">Skip to content</a><aside className="sidebar"><Link className="brand" href="/"><BrandLogo /></Link><SidebarNavigation active={active} /><div className="sidebar-bottom"><SidebarIdentity initialName={name} /><form action={async () => { 'use server'; await signOut(); }}><button className="signout" type="submit">Sign out</button></form></div></aside><main className="app-main" id="main-content">{children}</main></div>;
}
