import { z } from 'zod';

const MAX_PUBLIC_HTML_BYTES = 1_000_000;

/**
 * A complete document is required so the public Blob can be opened directly
 * by a browser without MCPBuddy having to wrap or execute supplied markup.
 */
export const publicHtmlSchema = z.string()
  .min(1, 'HTML must not be empty.')
  .max(MAX_PUBLIC_HTML_BYTES, 'HTML must be 1 MB or smaller.')
  .refine((html) => /^\s*(?:<!doctype\s+html[^>]*>\s*)?<html\b[\s\S]*<\/html>\s*$/i.test(html), {
    message: 'HTML must be a complete document with <html> and </html> tags.',
  });

export function publicHtmlBlobPath(userId: string, publicationId: string) {
  return `html/${userId}/${publicationId}.html`;
}
