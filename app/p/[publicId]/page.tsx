import { eq, and } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { publishedPages } from '@/lib/db/schema';
import { PageContent } from '@/components/page-content';

export default async function PublicPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const [page] = await getDb().select().from(publishedPages).where(and(eq(publishedPages.publicId, publicId), eq(publishedPages.isPublic, true))).limit(1);
  if (!page) notFound();
  return <PageContent title={page.title} content={page.content} visibility="Public" backHref="/" backLabel="MCPBuddy" />;
}
