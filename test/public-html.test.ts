import { describe, expect, it } from 'vitest';
import { publicHtmlBlobPath, publicHtmlSchema } from '@/lib/public-html';

describe('public HTML publishing input', () => {
  it('accepts a complete standalone HTML document', () => {
    expect(publicHtmlSchema.parse('<!doctype html><html><head><title>Hi</title></head><body>Hello</body></html>')).toContain('<html>');
  });

  it('rejects fragments and documents that exceed the bounded input size', () => {
    expect(() => publicHtmlSchema.parse('<main>Hello</main>')).toThrow('complete document');
    expect(() => publicHtmlSchema.parse(`<html>${'x'.repeat(1_000_000)}</html>`)).toThrow('1 MB');
  });

  it('uses an account-scoped, generated Blob path', () => {
    expect(publicHtmlBlobPath('user-123', 'publication-456')).toBe('html/user-123/publication-456.html');
  });
});
