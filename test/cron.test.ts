import { describe, expect, it } from 'vitest';
import { hasCronAuthorization } from '@/lib/cron';

describe('cron authorization', () => {
  it('requires the exact configured bearer secret', () => {
    const secret = 'a-32-character-test-cron-secret-123';
    expect(hasCronAuthorization(new Request('https://example.test'), secret)).toBe(false);
    expect(hasCronAuthorization(new Request('https://example.test', { headers: { authorization: 'Bearer wrong' } }), secret)).toBe(false);
    expect(hasCronAuthorization(new Request('https://example.test', { headers: { authorization: `Bearer ${secret}` } }), secret)).toBe(true);
  });
});
