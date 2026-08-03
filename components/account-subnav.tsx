'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ContactRound, ShieldCheck, WalletCards } from 'lucide-react';

const items = [
  { href: '/account/profile', label: 'Profile', description: 'Email and AI context', Icon: ContactRound },
  { href: '/account/security', label: 'Sign-in & security', description: 'Connected identities', Icon: ShieldCheck },
  { href: '/account/wallet', label: 'Wallet', description: 'Assets and signing queue', Icon: WalletCards },
];

export function AccountSubnav() {
  const pathname = usePathname();
  return <nav className="account-subnav" aria-label="Account sections">
    <p className="ui-kicker">Account</p>
    <div>{items.map(({ href, label, description, Icon }) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} aria-current={pathname === href ? 'page' : undefined}>
      <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
      <span><b>{label}</b><small>{description}</small></span>
    </Link>)}</div>
  </nav>;
}
