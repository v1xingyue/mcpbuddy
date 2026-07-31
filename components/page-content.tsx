import MarkdownIt from 'markdown-it';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from './brand-logo';

// HTML is deliberately disabled: page Markdown may be published by connected AI clients.
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true });

export function PageContent({ title, content, visibility, backHref, backLabel }: { title: string; content: string; visibility: 'Public' | 'Private'; backHref: string; backLabel: string }) {
  return <main className="published-page"><nav><a className="brand" href="/"><BrandLogo /></a><div className="page-actions"><a className="page-back" href={backHref}><ArrowLeft size={15} aria-hidden="true" />{backLabel}</a><span className="page-visibility">{visibility}</span></div></nav><article><p className="eyebrow">PUBLISHED WITH MCPBUDDY</p><h1>{title}</h1><div className="markdown" dangerouslySetInnerHTML={{ __html: markdown.render(content) }} /></article></main>;
}
