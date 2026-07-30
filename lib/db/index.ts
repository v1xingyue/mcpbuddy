import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/config';
import * as schema from './schema';

let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!env.POSTGRES_URL) throw new Error('POSTGRES_URL is not configured. Connect Vercel Postgres before using persisted data.');
  if (!db) db = drizzle(postgres(env.POSTGRES_URL, { prepare: false }), { schema });
  return db;
}
