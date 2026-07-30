import { eq, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { publishedPages, users } from '@/lib/db/schema';
import { PageContent } from '@/components/page-content';

export default async function PrivatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');
  const { id } = await params;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.githubId, session.user.id)).limit(1);
  if (!user) notFound();
  const [page] = await db.select().from(publishedPages).where(and(eq(publishedPages.id, id), eq(publishedPages.userId, user.id))).limit(1);
  if (!page) notFound();
  return <PageContent title={page.title} content={page.content} visibility={page.isPublic ? 'Public' : 'Private'} backHref="/pages" backLabel="All pages" />;
}
