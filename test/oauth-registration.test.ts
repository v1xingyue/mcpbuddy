import { describe, expect, it } from 'vitest';
import { GROK_REDIRECT, OPENAI_REDIRECT, registerClient, validateClient } from '../lib/oauth';

describe('OAuth dynamic client registration', () => {
  it('registers the official ChatGPT connector callback', () => {
    expect(registerClient({ redirect_uris: [OPENAI_REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }).client_id).toBe('openai');
  });
  it('rejects an untrusted redirect URI', () => {
    expect(() => registerClient({ redirect_uris: ['https://attacker.example/callback'] })).toThrow('invalid_client_metadata');
  });
  it('binds both registered clients to their exact callback', () => {
    expect(validateClient('grok', GROK_REDIRECT).clientId).toBe('grok');
    expect(() => validateClient('openai', GROK_REDIRECT)).toThrow('invalid_client');
  });
});
