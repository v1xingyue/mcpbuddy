import { describe, expect, it } from 'vitest';
import { GROK_REDIRECT, registerClient, validateClient } from '../lib/oauth';

const openAiRedirect = 'https://chatgpt.com/connector/oauth/LfVI2_usMsda';

describe('OAuth dynamic client registration', () => {
  it('registers the official ChatGPT connector callback', () => {
    const client = registerClient({ redirect_uris: [openAiRedirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
    expect(client.client_id).toBe('openai');
    expect(client.redirect_uris).toEqual([openAiRedirect]);
  });
  it('rejects an untrusted redirect URI', () => {
    expect(() => registerClient({ redirect_uris: ['https://attacker.example/callback'] })).toThrow('invalid_client_metadata');
  });
  it('permits only the explicitly configured debug callback', () => {
    const debugRedirect = 'http://127.0.0.1:6274/oauth/callback';
    expect(registerClient({ redirect_uris: [debugRedirect] }, debugRedirect).client_id).toBe('debug');
    expect(validateClient('debug', debugRedirect, debugRedirect).clientId).toBe('debug');
    expect(() => registerClient({ redirect_uris: ['http://127.0.0.1:6275/oauth/callback'] }, debugRedirect)).toThrow('invalid_client_metadata');
  });
  it('binds both registered clients to their exact callback', () => {
    expect(validateClient('grok', GROK_REDIRECT).clientId).toBe('grok');
    expect(validateClient('openai', openAiRedirect).clientId).toBe('openai');
    expect(() => validateClient('openai', GROK_REDIRECT)).toThrow('invalid_client');
  });
});
