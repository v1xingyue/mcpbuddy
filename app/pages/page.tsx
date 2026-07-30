import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth, signOut } from '@/auth';
import { provisionUser } from '@/app/actions';
import { getDb } from '@/lib/db';
import { publishedPages } from '@/lib/db/schema';
import { PageList } from '@/components/page-list';
import { DashboardNav } from '@/components/dashboard-nav';

export default async function PagesManager() {
  const session = await auth(); if (!session?.user?.id) redirect('/');
  const user = await provisionUser(); if (!user) redirect('/');
  const pages = await getDb().select({ id: publishedPages.id, title: publishedPages.title, slug: publishedPages.slug, isPublic: publishedPages.isPublic, publicId: publishedPages.publicId }).from(publishedPages).where(eq(publishedPages.userId, user.id));
  return <main><nav><a className="brand" href="/">mcp<span>buddy</span></a><div className="nav-actions"><DashboardNav active="pages" /><form action={async () => { 'use server'; await signOut(); }}><button className="quiet">Sign out</button></form></div></nav><section className="manager-head"><p className="eyebrow">PAGE LIBRARY</p><h1>Your published pages.</h1><p>Manage public share links and private pages created through your MCP tools.</p></section><PageList pages={pages} /><footer><span>Built for the open agent web.</span><span>Vercel Postgres · Private Blob · Solana</span></footer></main>;
}
