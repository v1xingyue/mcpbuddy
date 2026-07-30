import { auth } from '@/auth';
import { provisionUser } from '@/app/actions';
import { SignJWT } from 'jose';

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await auth();
  const { provider } = await params;
  if (!session?.user?.id || !['github', 'google'].includes(provider)) return Response.redirect(new URL('/', request.url));
  const user = await provisionUser();
  if (!user) return Response.redirect(new URL('/', request.url));
  const token = await new SignJWT({ typ: 'identity_link', provider })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const response = Response.redirect(new URL(`/api/auth/signin/${provider}?callbackUrl=${encodeURIComponent('/')}`, request.url));
  response.headers.append('Set-Cookie', `mcpbuddy_link=${token}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
  return response;
}
