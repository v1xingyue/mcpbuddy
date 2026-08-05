import { describe, expect, it } from 'vitest';
import { pluginForTool } from '@/lib/mcp/tool-catalog';

describe('dashboard tool grouping', () => {
  it('keeps every compact xStocks tool in the xStocks plugin', () => {
    expect(['search_xstocks', 'list_xstocks_by_volume', 'get_xstock_market', 'quote_xstock_swap', 'create_xstock_swap'].map(pluginForTool)).toEqual(Array(5).fill('xstocks/public'));
  });
});
