import { SignJWT } from 'jose';

export async function POST(request: Request) {
  const { address } = await request.json().catch(() => ({}));
  if (typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return Response.json({ error: 'Invalid Solana address.' }, { status: 400 });
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const challenge = await new SignJWT({ typ: 'wallet_login' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(address).setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const message = `Sign in to MCPBuddy\nWallet: ${address}\nChallenge: ${challenge}\nExpires: ${expiresAt.toISOString()}`;
  return Response.json({ challenge, message });
}
