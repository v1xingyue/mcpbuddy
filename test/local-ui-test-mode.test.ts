import { describe, expect, it } from 'vitest';
import { isLocalUiTestMode } from '@/lib/local-ui-test-mode';

describe('isLocalUiTestMode', () => {
  it('requires an explicit local flag outside production', () => {
    expect(isLocalUiTestMode('development', '1')).toBe(true);
    expect(isLocalUiTestMode('development', undefined)).toBe(false);
  });

  it('never enables visual fixtures in production', () => {
    expect(isLocalUiTestMode('production', '1')).toBe(false);
  });
});
