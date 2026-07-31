import type { Metadata } from 'next';
import './globals.css';
import './brand.css';
import './wallet-assets.css';
import './identity-toggles.css';
import './connection-cards.css';
import './ui-system.css';
import { CardHoverSound } from '@/components/card-hover-sound';

export const metadata: Metadata = {
  title: 'MCPBuddy — your AI connection center',
  description: 'One private MCP center for Claude, OpenAI and Grok.',
  icons: { icon: '/icon.svg', shortcut: '/icon.svg', apple: '/icon.svg' }
};
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}<CardHoverSound /></body></html>; }
