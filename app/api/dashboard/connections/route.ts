import { eq } from 'drizzle-orm';
import { provisionUser } from '@/app/actions';
import { getDb } from '@/lib/db';
import { platformConnections } from '@/lib/db/schema';

export async function GET() {
  const user = await provisionUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const connections = await getDb().select({ platform: platformConnections.platform }).from(platformConnections).where(eq(platformConnections.userId, user.id));
  return Response.json({ connectedPlatforms: connections.map(connection => connection.platform) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
