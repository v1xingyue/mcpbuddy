'use client';

import { useEffect, useMemo, useState } from 'react';
import { setXstocksPublicToolsEnabled } from '@/app/actions';
type Tool = { name: string; description: string };
type Plugin = { id: string; label: string; category: string; summary: string; tools: Tool[]; controllable?: boolean };

const fixturePlugins: Plugin[] = [
  {
    id: 'account/core',
    label: 'Account core',
    category: 'Account',
    summary: 'Identity, client confirmation, and the private AI Context Pack.',
    tools: [
      { name: 'user_info()', description: 'Read the private AI Context Pack.' },
      { name: 'hello(platform)', description: 'Confirm a connected AI client.' },
    ],
  },
  {
    id: 'solana/base',
    label: 'Solana base',
    category: 'Solana',
    summary: 'Wallet lookup, token balances, unsigned transfers, and transaction status.',
    tools: [
      { name: 'get_wallet_address()', description: 'Return the bound Solana wallet.' },
      { name: 'get_solana_asset_balances()', description: 'Read token balances and USD values.' },
      { name: 'create_solana_sol_transfer(recipient, amount)', description: 'Create a native-SOL transfer for wallet review.' },
      { name: 'create_solana_token_transfer(token, recipient, amount)', description: 'Create an SPL-token transfer for wallet review.' },
      { name: 'get_solana_transaction_status(transactionId)', description: 'Read an account-owned pending transaction status.' },
    ],
  },
  {
    id: 'solana/jupiter',
    label: 'Solana Jupiter',
    category: 'Solana',
    summary: 'Jupiter route discovery, quotes, and unsigned swap creation.',
    tools: [
      { name: 'list_solana_swap_tokens()', description: 'List currently quoteable symbols, mints, and decimals.' },
      { name: 'quote_solana_swap(inputToken, outputToken, amount, slippageBps)', description: 'Get a read-only route and expected output before creating a swap.' },
      { name: 'create_solana_swap(inputToken, outputToken, amount, slippageBps)', description: 'Create a Jupiter swap for wallet review.' },
      { name: 'create_solana_swap_by_mint(inputMint, outputMint, amount)', description: 'Create a Jupiter swap by mint; amount is atomic.' },
    ],
  },
  {
    id: 'hylo/core',
    label: 'Hylo operations',
    category: 'Solana',
    summary: 'Solana protocol tools for Hylo buy/sell operations through wallet review.',
    tools: [
      { name: 'list_hylo_assets(category)', description: 'List live Hylo asset symbols and mints before an operation.' },
      { name: 'get_hylo_asset_balances()', description: 'Read Hylo token balances in the bound Solana wallet.' },
      { name: 'create_hylo_buy_asset(assetSymbol, inputMint, inputAmountAtomic, slippageBps)', description: 'Create an unsigned swap into a Hylo asset for wallet review.' },
      { name: 'create_hylo_sell_asset(assetSymbol, outputMint, assetAmountAtomic, slippageBps)', description: 'Create an unsigned swap out of a Hylo asset for wallet review.' },
      { name: 'get_hylo_operation_guide(operation)', description: 'Show the matching Hylo MCP operation.' },
    ],
  },
  {
    id: 'xstocks/public',
    label: 'xStocks public data',
    category: 'Markets',
    summary: 'Compact xStocks market discovery plus Jupiter-routed, wallet-reviewed swaps; no server-side signing.',
    tools: [
      { name: 'search_xstocks(query?, limit?, cursor?)', description: 'Find verified Solana xStocks by ticker or name in compact pages.' },
      { name: 'list_xstocks_by_volume(limit?)', description: 'List the top 10 verified xStocks by public 24-hour DEX volume.' },
      { name: 'get_xstock_market(symbol)', description: 'Get one xStock’s official price and public 24-hour DEX volume.' },
      { name: 'quote_xstock_swap(side, symbol, amount, slippageBps)', description: 'Get a read-only USDC/xStock Jupiter route.' },
      { name: 'create_xstock_swap(side, symbol, amount, slippageBps)', description: 'Create an unsigned xStock swap for wallet review.' },
    ],
  },
  {
    id: 'content/pages',
    label: 'Content pages',
    category: 'Content',
    summary: 'Account-owned Markdown and public HTML publishing tools.',
    tools: [
      { name: 'publish_page(slug, title, content, public)', description: 'Publish an account-owned Markdown page.' },
      { name: 'publish_html(html)', description: 'Publish a standalone HTML document and return its public URL.' },
      { name: 'list_pages()', description: 'List available pages.' },
      { name: 'get_page_content(id | title)', description: 'Read one page by ID or title.' },
    ],
  },
];

export function DashboardTools({ plugins = fixturePlugins, xstocksEnabled = true }: { plugins?: Plugin[]; xstocksEnabled?: boolean }) {
  const [registeredPlugins, setRegisteredPlugins] = useState(plugins);
  const allToolNames = registeredPlugins.flatMap(plugin => plugin.tools.map(tool => tool.name));
  const categories = useMemo(() => ['All', ...new Set(registeredPlugins.map(plugin => plugin.category))], [registeredPlugins]);
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  const [selected, setSelected] = useState(() => new Set(allToolNames));
  const [open, setOpen] = useState(() => new Set(plugins.map(plugin => plugin.id)));
  const [status, setStatus] = useState('');
  const [isXstocksEnabled, setIsXstocksEnabled] = useState(xstocksEnabled);
  const [savingXstocks, setSavingXstocks] = useState(false);

  useEffect(() => { fetch('/api/dashboard/tools', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => {
    if (Array.isArray(data?.plugins)) { setRegisteredPlugins(data.plugins); setOpen(new Set(data.plugins.map((plugin: Plugin) => plugin.id))); setSelected(new Set(data.plugins.flatMap((plugin: Plugin) => plugin.tools.map(tool => tool.name)))); }
  }).catch(() => undefined); }, []);
  const visiblePlugins = activeCategory === 'All' ? registeredPlugins : registeredPlugins.filter(plugin => plugin.category === activeCategory);
  const selectedCount = selected.size;
  const visibleToolCount = visiblePlugins.reduce((count, plugin) => count + plugin.tools.length, 0);

  const toggleTool = (name: string) => setSelected(current => {
    const next = new Set(current);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const togglePlugin = (plugin: Plugin) => setSelected(current => {
    const next = new Set(current);
    const names = plugin.tools.map(tool => tool.name);
    const everySelected = names.every(name => next.has(name));
    names.forEach(name => everySelected ? next.delete(name) : next.add(name));
    return next;
  });

  const toggleOpen = (pluginId: string) => setOpen(current => {
    const next = new Set(current);
    next.has(pluginId) ? next.delete(pluginId) : next.add(pluginId);
    return next;
  });

  async function exportSelected() {
    const chosen = registeredPlugins.flatMap(plugin => plugin.tools.map(tool => ({ ...tool, category: plugin.category, plugin: plugin.id }))).filter(tool => selected.has(tool.name));
    await navigator.clipboard.writeText(JSON.stringify({ tools: chosen }, null, 2)).catch(() => undefined);
    setStatus(`${chosen.length} tool definition(s) copied as JSON.`);
  }

  async function toggleXstocks() {
    const next = !isXstocksEnabled;
    setSavingXstocks(true);
    try { await setXstocksPublicToolsEnabled(next); setIsXstocksEnabled(next); setStatus(`xStocks public tools ${next ? 'enabled' : 'disabled'} for this account.`); }
    catch { setStatus('Could not update the xStocks tool setting. Please try again.'); }
    finally { setSavingXstocks(false); }
  }

  return (
    <section className="tools">
      <header className="tools-head">
        <div>
          <p className="eyebrow">MCP TOOL CATALOG</p>
          <h2>Choose what to export.</h2>
          <p className="tools-intro">Browse by category, fold plugins you do not need, and select a whole plugin when an agent needs that capability set. Hylo lives under Solana because its tools operate on Solana assets.</p>
        </div>
        <button type="button" onClick={() => void exportSelected()} disabled={!selectedCount}>Export selected ({selectedCount})</button>
      </header>

      <div className="tool-workspace">
        <aside className="tool-sidebar" aria-label="Tool categories and export status">
          <div className="tool-tabs" role="tablist" aria-label="Tool categories">
            {categories.map(category => (
              <button key={category} type="button" role="tab" aria-selected={activeCategory === category} className={activeCategory === category ? 'active' : undefined} onClick={() => setActiveCategory(category)}>
                <span>{category}</span>
                <small>{category === 'All' ? allToolNames.length : registeredPlugins.filter(plugin => plugin.category === category).reduce((count, plugin) => count + plugin.tools.length, 0)}</small>
              </button>
            ))}
          </div>
          <div className="tool-selection-summary">
            <small>SELECTED</small>
            <b>{selectedCount} / {allToolNames.length}</b>
            <span>{visiblePlugins.length} plugin{visiblePlugins.length === 1 ? '' : 's'} · {visibleToolCount} visible tool{visibleToolCount === 1 ? '' : 's'}</span>
          </div>
        </aside>

        <div className="tool-plugin-list">
          {visiblePlugins.map(plugin => {
            const pluginToolNames = plugin.tools.map(tool => tool.name);
            const pluginSelectedCount = pluginToolNames.filter(name => selected.has(name)).length;
            const isOpen = open.has(plugin.id);
            const allSelected = pluginSelectedCount === plugin.tools.length;

            return (
              <section className="tool-plugin" key={plugin.id}>
                <div className="tool-plugin-head">
                  <button type="button" className="tool-plugin-toggle" aria-expanded={isOpen} onClick={() => toggleOpen(plugin.id)}>
                    <span>
                      <small>{plugin.id}</small>
                      <b>{plugin.label}</b>
                      <em>{plugin.summary}</em>
                    </span>
                    <i aria-hidden="true">{isOpen ? 'Hide' : 'Show'}</i>
                  </button>
                  <button type="button" className="tool-plugin-select" onClick={() => togglePlugin(plugin)}>
                    {allSelected ? 'Clear plugin' : 'Select plugin'} ({pluginSelectedCount}/{plugin.tools.length})
                  </button>
                  {plugin.controllable && <button type="button" className="tool-plugin-select" onClick={() => void toggleXstocks()} disabled={savingXstocks} aria-pressed={isXstocksEnabled}>
                    {savingXstocks ? 'Saving…' : isXstocksEnabled ? 'Disable for account' : 'Enable for account'}
                  </button>}
                </div>

                {isOpen && (
                  <ol className="tool-list">
                    {plugin.tools.map(tool => (
                      <li key={tool.name}>
                        <label className="tool-card ui-interactive-card">
                          <input type="checkbox" checked={selected.has(tool.name)} onChange={() => toggleTool(tool.name)} />
                          <span className="tool-card-content">
                            <code className="endpoint">{tool.name}</code>
                            <span>{tool.description}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {status && <p className="swap-status" role="status">{status}</p>}
    </section>
  );
}
