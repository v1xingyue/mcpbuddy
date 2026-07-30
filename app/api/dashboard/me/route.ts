import { provisionUser } from '@/app/actions';

export async function GET() {
  const user = await provisionUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ name: user.name ?? user.email });
}
