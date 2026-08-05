const xstocksToolNames = new Set(['search_xstocks', 'list_xstocks_by_volume', 'get_xstock_market', 'quote_xstock_swap', 'create_xstock_swap']);

/** Maps registered MCP tool names to their dashboard plugin without relying on fragile name substrings. */
export function pluginForTool(name: string) {
  if (xstocksToolNames.has(name)) return 'xstocks/public';
  if (name.includes('hylo')) return 'hylo/core';
  if (name.includes('solana') || name.includes('wallet')) return 'solana/base';
  if (name.includes('page') || name === 'publish_html') return 'content/pages';
  return 'account/core';
}
