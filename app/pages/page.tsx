import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { provisionUser } from '@/app/actions';
import { getDb } from '@/lib/db';
import { publishedPages } from '@/lib/db/schema';
import { PageList } from '@/components/page-list';
import { AppShell } from '@/components/app-shell';

export default async function PagesManager() {
  const session = await auth(); if (!session?.user) redirect('/');
  const user = await provisionUser(); if (!user) redirect('/');
  const pages = await getDb().select({ id: publishedPages.id, title: publishedPages.title, slug: publishedPages.slug, isPublic: publishedPages.isPublic, publicId: publishedPages.publicId }).from(publishedPages).where(eq(publishedPages.userId, user.id));
  return <AppShell active="pages" name={user.name ?? user.email}><header className="app-page-head"><p className="eyebrow">DATA LIBRARY</p><h1>Pages</h1><p>Manage private pages and public share links published by your AI clients.</p></header><PageList pages={pages} /></AppShell>;
}
