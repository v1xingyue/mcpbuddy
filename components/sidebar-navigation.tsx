'use client';

import { ChevronDown, Cable, ContactRound, Database, Settings2, ShieldCheck, WalletCards, Wrench } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

type Area = 'connections' | 'tools' | 'pages' | 'account';

const primaryItems = [
  { id: 'connections' as const, href: '/', label: 'Connections', Icon: Cable },
  { id: 'tools' as const, href: '/tools', label: 'Tool list', Icon: Wrench },
  { id: 'pages' as const, href: '/pages', label: 'Data · Pages', Icon: Database },
];

const accountItems = [
  { href: '/account/profile', label: 'Profile', Icon: ContactRound },
  { href: '/account/security', label: 'Sign-in & security', Icon: ShieldCheck },
  { href: '/account/wallet', label: 'Wallet', Icon: WalletCards },
];

export function SidebarNavigation({ active }: { active: Area }) {
  const [accountExpanded, setAccountExpanded] = useState(active === 'account');
  const pathname = usePathname();

  return <nav className="sidebar-nav" aria-label="Application navigation">
    {primaryItems.map(({ id, href, label, Icon }) => <Link key={id} className={active === id ? 'active' : ''} href={href} aria-current={active === id ? 'page' : undefined}>
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />{label}
    </Link>)}
    <div className={`sidebar-nav-group${accountExpanded ? ' is-expanded' : ''}`}>
      <div className="sidebar-nav-group-heading">
        <Link className={active === 'account' ? 'active' : ''} href="/account/profile">
          <Settings2 size={17} strokeWidth={1.8} aria-hidden="true" />Account
        </Link>
        <button type="button" className="sidebar-nav-toggle" aria-label={`${accountExpanded ? 'Collapse' : 'Expand'} Account menu`} aria-expanded={accountExpanded} aria-controls="account-submenu" onClick={() => setAccountExpanded((expanded) => !expanded)}>
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div id="account-submenu" className="sidebar-submenu" hidden={!accountExpanded}>
        {accountItems.map(({ href, label, Icon }) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} aria-current={pathname === href ? 'page' : undefined}>
          <Icon size={15} strokeWidth={1.8} aria-hidden="true" />{label}
        </Link>)}
      </div>
    </div>
  </nav>;
}
