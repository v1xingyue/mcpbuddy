import { z } from 'zod';

const envSchema = z.object({
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
  POSTGRES_URL: z.string().url().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  OAUTH_SECRET: z.string().min(32).optional(),
  MCP_RESOURCE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export const env = envSchema.parse({
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
  AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
  POSTGRES_URL: process.env.POSTGRES_URL,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  OAUTH_SECRET: process.env.OAUTH_SECRET,
  MCP_RESOURCE_URL: process.env.MCP_RESOURCE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export function publicOrigin(request?: Request) {
  return env.MCP_RESOURCE_URL ?? (request ? new URL(request.url).origin : env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
}

export function requireProductionStorage() {
  if (process.env.VERCEL && !env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required in Vercel production for OAuth replay protection.');
  }
}
