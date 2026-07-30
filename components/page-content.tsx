export function PageContent({ title, content, visibility }: { title: string; content: string; visibility: 'Public' | 'Private' }) {
  return <main className="published-page"><nav><a className="brand" href="/">mcp<span>buddy</span></a><span className="page-visibility">{visibility}</span></nav><article><p className="eyebrow">PUBLISHED WITH MCPBUDDY</p><h1>{title}</h1><pre>{content}</pre></article></main>;
}
