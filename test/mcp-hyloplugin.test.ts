import { describe, expect, it } from 'vitest';
import { hyloAssets, hyloPrograms, liveHyloAsset } from '@/lib/hylo';
import { registerHyloCorePlugin } from '@/lib/mcp/plugins/hylo/core';

function recorder() {
  const calls: Array<{ kind: string; name: string }> = [];
  return { calls, server: { registerTool: (name: string) => calls.push({ kind: 'registerTool', name }) } };
}

describe('Hylo MCP tool package', () => {
  const context = { currentUser: async () => ({ id: 'user-id' }), reviewUiUri: 'ui://review', reviewUi: '<html></html>', reviewOutputSchema: {}, transactionStatusOutputSchema: {}, appOrigin: () => 'https://app.example' };

  it('registers Hylo operation tools', () => {
    const { calls, server } = recorder();
    registerHyloCorePlugin(server, context);
    expect(calls.map(call => call.name)).toEqual(['list_hylo_assets', 'get_hylo_asset_balances', 'create_hylo_buy_asset', 'create_hylo_sell_asset', 'get_hylo_operation_guide']);
  });

  it('keeps documented live assets and programs addressable', () => {
    expect(hyloPrograms.map(program => program.address)).toEqual(expect.arrayContaining(['HYEXCHtHkBagdStcJCp3xbbb9B7sdMdWXFNj6mdsG4hn', 'HysTabVUfmQBFcmzu1ctRd1Y1fxd66RBpboy1bmtDSQQ']));
    expect(hyloAssets.filter(asset => asset.status === 'live').map(asset => asset.symbol)).toEqual(expect.arrayContaining(['hyUSD', 'eHYUSD', 'hyloSOL', 'hyloSOL+', 'xSOL', 'cbBTC']));
    expect(hyloAssets.find(asset => asset.symbol === 'xBTC')).toMatchObject({ status: 'coming_soon', mint: null });
  });

  it('rejects Hylo assets that are not live mints for operations', () => {
    expect(liveHyloAsset('xSOL')).toMatchObject({ symbol: 'xSOL', mint: '4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs' });
    expect(() => liveHyloAsset('xBTC')).toThrow('not currently listed as a live Hylo mint');
  });
});
