import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';
import { env, publicOrigin } from './config';
import { getDb } from './db';
import { oauthTokenUses } from './db/schema';

type TokenKind = 'code' | 'access_token' | 'refresh_token';
type Claims = { sub: string; client_id: string; scope: string; redirect_uri?: string; code_challenge?: string; jti?: string; typ: TokenKind };

function secret() {
  if (!env.OAUTH_SECRET) throw new Error('OAUTH_SECRET is required for MCP OAuth.');
  return new TextEncoder().encode(env.OAUTH_SECRET);
}

export async function issueToken(origin: string, claims: Omit<Claims, 'jti'>, expiresIn: string) {
  const jti = randomUUID();
  const token = await new SignJWT({ ...claims, jti })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(origin).setAudience(`${origin}/api/mcp`).setSubject(claims.sub)
    .setJti(jti).setIssuedAt().setExpirationTime(expiresIn).sign(secret());
  return token;
}

export async function verifyToken(token: string, origin: string, typ: TokenKind) {
  const { payload } = await jwtVerify(token, secret(), { issuer: origin, audience: `${origin}/api/mcp` });
  if (payload.typ !== typ || !payload.sub || !payload.jti) throw new Error('Invalid token type or claims.');
  return payload as typeof payload & Claims & { sub: string; jti: string; client_id: string; scope: string };
}

export async function consume(kind: 'code' | 'refresh', jti: string) {
  const inserted = await getDb().insert(oauthTokenUses).values({ kind, jti }).onConflictDoNothing().returning();
  if (!inserted.length) throw new Error('Token replay detected.');
}

export async function pkceS256(verifier: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return Buffer.from(hash).toString('base64url');
}

export const GROK_REDIRECT = 'https://grok.com/connectors-oauth-exchange-code/';
// ChatGPT assigns each connector an opaque, per-connector callback path.
export const OPENAI_REDIRECT_PREFIX = 'https://chatgpt.com/connector/oauth/';
export const supportedScopes = ['mcp:tools', 'mcp:read', 'mcp:write', 'openid', 'offline_access'];

type RegisteredClient = { clientId: 'grok' | 'openai'; name: string; redirectUri?: string };
const clients: RegisteredClient[] = [
  { clientId: 'grok', name: 'Grok', redirectUri: GROK_REDIRECT },
  { clientId: 'openai', name: 'ChatGPT' },
];

function isOpenAiRedirect(uri: unknown): uri is string {
  return typeof uri === 'string' && /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{6,200}$/.test(uri);
}

function validDcrMetadata(body: { token_endpoint_auth_method?: unknown; grant_types?: unknown; response_types?: unknown }) {
  return (body.token_endpoint_auth_method == null || body.token_endpoint_auth_method === 'none')
    && (body.grant_types == null || (Array.isArray(body.grant_types) && body.grant_types.every(value => value === 'authorization_code' || value === 'refresh_token')))
    && (body.response_types == null || (Array.isArray(body.response_types) && body.response_types.every(value => value === 'code')));
}

export function registerClient(metadata: { redirect_uris?: unknown; token_endpoint_auth_method?: unknown; grant_types?: unknown; response_types?: unknown; client_name?: unknown }) {
  const redirectUris = metadata.redirect_uris;
  const redirectUri = Array.isArray(redirectUris) && redirectUris.length === 1 && typeof redirectUris[0] === 'string' ? redirectUris[0] : undefined;
  const client = redirectUri === GROK_REDIRECT ? clients[0] : isOpenAiRedirect(redirectUri) ? clients[1] : undefined;
  if (!client || !validDcrMetadata(metadata)) throw new Error('invalid_client_metadata');
  return { client_id: client.clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: client.name, redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
}

export function validateClient(clientId: string, redirectUri: string) {
  const client = clients.find(item => item.clientId === clientId && (item.redirectUri === redirectUri || (item.clientId === 'openai' && isOpenAiRedirect(redirectUri))));
  if (!client) throw new Error('invalid_client');
  return client;
}

export function oauthMetadata(request: Request) {
  const origin = publicOrigin(request);
  return { issuer: origin, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`, registration_endpoint: `${origin}/oauth/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: supportedScopes };
}
