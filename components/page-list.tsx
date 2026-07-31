import { deletePublishedPage } from '@/app/actions';
import Link from 'next/link';

type Page = { id: string; title: string; slug: string; isPublic: boolean; publicId: string | null };
export function PageList({ pages }: { pages: Page[] }) {
  return <section className="page-list"><div><p className="eyebrow">YOUR PAGES</p><h2>Published from your agents.</h2></div><div>{pages.length ? pages.map(page => <div className="page-row ui-interactive-card" key={page.id}><Link href={page.isPublic && page.publicId ? `/p/${page.publicId}` : `/pages/${page.id}`}><span>{page.title}<small>/{page.slug}</small></span><b>{page.isPublic ? 'Public ↗' : 'Private →'}</b></Link><form action={deletePublishedPage.bind(null, page.id)}><button className="delete-page" type="submit" aria-label={`Delete ${page.title}`}>Delete</button></form></div>) : <p className="empty-pages">No pages yet. Ask a connected agent to call <code>publish_page</code>.</p>}</div></section>;
}
