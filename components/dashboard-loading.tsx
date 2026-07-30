export function DashboardLoading({ title = 'Loading workspace…' }: { title?: string }) {
  return <main className="loading-screen" aria-busy="true" aria-live="polite"><div className="loading-sidebar"><span className="loading-brand">mcp<span>buddy</span></span><i /><i /><i /><i /></div><section className="loading-main"><p className="eyebrow">MCPBUDDY</p><h1>{title}</h1><div className="loading-block large" /><div className="loading-grid"><div /><div /><div /></div></section></main>;
}
