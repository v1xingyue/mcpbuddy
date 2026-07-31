function Copy({ children }: { children: React.ReactNode }) { return <code className="endpoint">{children}</code>; }

export function DashboardTools() {
  const tools = [
    ['user_info()', 'Read the private userinfo.md context first—profile, preferences, constraints, and current goals.'],
    ['hello(platform)', 'Records a verified connection after the selected AI client calls it.'],
    ['get_wallet_address()', 'Returns the verified Solana wallet address bound to the current account.'],
    ['get_solana_asset_balances()', 'Returns configured famous Solana-token balances with live USD prices and value per asset.'],
    ['publish_page(slug, title, content, public)', 'Public pages receive a shareable URL; private pages remain available only to you.'],
    ['list_pages()', 'Lists pages available to the connected client.'],
    ['get_page_content(id | title)', 'Reads a page’s full Markdown by its ID or exact title. Use the ID when titles are duplicated.'],
  ] as const;
  return <section className="tools"><div><p className="eyebrow">AVAILABLE TOOLS</p><h2>Useful from day one.</h2><p className="tools-intro">Account-scoped capabilities available to your connected AI clients.</p></div><ol className="tool-list">{tools.map(([name, description], index) => <li className="tool-card" key={name}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><Copy>{name}</Copy><p>{description}</p></div></li>)}</ol></section>;
}
