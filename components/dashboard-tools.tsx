'use client';

import { useState } from 'react';

function Copy({ children }: { children: React.ReactNode }) { return <code className="endpoint">{children}</code>; }

export function DashboardTools() {
  const [copied, setCopied] = useState<string | null>(null);
  const tools = [
    ['user_info()', 'Read your private AI Context Pack first—profile, preferences, limits, goals, project notes, and tool guidance.'],
    ['hello(platform)', 'Records a verified connection after the selected AI client calls it.'],
    ['get_wallet_address()', 'Returns the verified Solana wallet address bound to the current account.'],
    ['get_solana_asset_balances()', 'Returns configured famous Solana-token balances with live USD prices and value per asset.'],
    ['list_solana_swap_tokens()', 'Swap step 1 — lists mainnet token symbols and decimals. Call this first; use the returned symbol, not a guessed mint address.'],
    ['create_solana_swap(inputToken, outputToken, amount, slippageBps)', 'Swap step 2 — creates an unsigned Jupiter transaction. amount is a display amount such as "0.1"; review and sign it from Account → Pending swaps.'],
    ['publish_page(slug, title, content, public)', 'Public pages receive a shareable URL; private pages remain available only to you.'],
    ['list_pages()', 'Lists pages available to the connected client.'],
    ['get_page_content(id | title)', 'Reads a page’s full Markdown by its ID or exact title. Use the ID when titles are duplicated.'],
  ] as const;
  async function copyToolName(name: string) {
    await navigator.clipboard?.writeText(name).catch(() => undefined);
    setCopied(name);
    window.setTimeout(() => setCopied(current => current === name ? null : current), 1_800);
  }
  return <section className="tools"><div><p className="eyebrow">AVAILABLE TOOLS</p><h2>Useful from day one.</h2><p className="tools-intro">Account-scoped capabilities available to your connected AI clients. For swaps, call the token list first, then create the unsigned transaction. Select a tool card to copy its invocation.</p></div><ol className="tool-list">{tools.map(([name, description], index) => <li key={name}><button type="button" className={copied === name ? 'tool-card copied ui-interactive-card' : 'tool-card ui-interactive-card'} onClick={() => void copyToolName(name)} aria-label={`Copy ${name}`}><span className="tool-card-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="tool-card-content"><Copy>{name}</Copy><span>{description}</span></span><span className="tool-card-copy" aria-hidden="true">{copied === name ? 'Copied' : 'Copy'}</span></button></li>)}</ol></section>;
}
