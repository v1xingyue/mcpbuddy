import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'MCPBuddy — your AI connection center', description: 'One private MCP center for Claude, OpenAI and Grok.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
