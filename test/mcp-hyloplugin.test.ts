import { describe, expect, it } from 'vitest';
import { hyloAssets, hyloPrograms } from '@/lib/hylo';
import { registerHyloCorePlugin } from '@/lib/mcp/plugins/hylo/core';

function recorder() {
  const calls: Array<{ kind: string; name: string }> = [];
  return { calls, server: { registerTool: (name: string) => calls.push({ kind: 'registerTool', name }) } };
}

describe('Hylo MCP tool package', () => {
  it('registers Hylo protocol discovery tools', () => {
    const { calls, server } = recorder();
    registerHyloCorePlugin(server);
    expect(calls.map(call => call.name)).toEqual(['list_hylo_assets', 'get_hylo_onchain_addresses', 'get_hylo_operation_guide', 'get_hylo_developer_resources']);
  });

  it('keeps documented live assets and programs addressable', () => {
    expect(hyloPrograms.map(program => program.address)).toEqual(expect.arrayContaining(['HYEXCHtHkBagdStcJCp3xbbb9B7sdMdWXFNj6mdsG4hn', 'HysTabVUfmQBFcmzu1ctRd1Y1fxd66RBpboy1bmtDSQQ']));
    expect(hyloAssets.filter(asset => asset.status === 'live').map(asset => asset.symbol)).toEqual(expect.arrayContaining(['hyUSD', 'eHYUSD', 'hyloSOL', 'hyloSOL+', 'xSOL', 'cbBTC']));
    expect(hyloAssets.find(asset => asset.symbol === 'xBTC')).toMatchObject({ status: 'coming_soon', mint: null });
  });
});
