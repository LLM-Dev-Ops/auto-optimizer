import { exchangeOAuthCode } from '../src/integrations/github/github-auth';

const config = {
  clientId: 'fixture-client',
  clientSecret: 'fixture-secret',
  callbackUrl: 'https://example.invalid/callback',
  scopes: ['repo']
};

// Unit fixtures only: no OAuth request or task data leaves this process.
afterEach(() => jest.restoreAllMocks());

test.each([null, {}, { access_token: 7, token_type: 'bearer', scope: 'repo' },
  { access_token: 'fixture', token_type: 'bearer', scope: ['repo'] },
  { access_token: 'fixture', token_type: 'bearer', scope: 'repo', expires_in: -1 }
])('OAuth rejects malformed response shape %#', async value => {
  const transport = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(value), { status: 200 })
  );
  await expect(exchangeOAuthCode(config, 'fixture-code')).rejects.toThrow('Invalid OAuth token response');
  expect(transport).toHaveBeenCalledTimes(1);
});

test('OAuth preserves a well-formed response including optional fields', async () => {
  const value = { access_token: 'fixture', token_type: 'bearer', scope: 'repo',
    expires_in: 3600, refresh_token: 'fixture-refresh', refresh_token_expires_in: 7200 };
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(value), { status: 200 }));
  await expect(exchangeOAuthCode(config, 'fixture-code')).resolves.toEqual(value);
});
