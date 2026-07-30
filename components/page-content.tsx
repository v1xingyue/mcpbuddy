import MarkdownIt from 'markdown-it';

// HTML is deliberately disabled: page Markdown may be published by connected AI clients.
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true });

export function PageContent({ title, content, visibility }: { title: string; content: string; visibility: 'Public' | 'Private' }) {
  return <main className="published-page"><nav><a className="brand" href="/">mcp<span>buddy</span></a><span className="page-visibility">{visibility}</span></nav><article><p className="eyebrow">PUBLISHED WITH MCPBUDDY</p><h1>{title}</h1><div className="markdown" dangerouslySetInnerHTML={{ __html: markdown.render(content) }} /></article></main>;
}
