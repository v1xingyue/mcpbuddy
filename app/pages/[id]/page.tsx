import { eq, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { publishedPages } from '@/lib/db/schema';
import { PageContent } from '@/components/page-content';
import { provisionUser } from '@/app/actions';

export default async function PrivatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await provisionUser();
  if (!user) redirect('/');
  const { id } = await params;
  const db = getDb();
  const [page] = await db.select().from(publishedPages).where(and(eq(publishedPages.id, id), eq(publishedPages.userId, user.id))).limit(1);
  if (!page) notFound();
  return <PageContent title={page.title} content={page.content} visibility={page.isPublic ? 'Public' : 'Private'} backHref="/pages" backLabel="All pages" />;
}
