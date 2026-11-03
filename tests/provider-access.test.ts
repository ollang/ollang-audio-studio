import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Provider, ProviderError } from '../server/provider.ts';
import { checkProviderAccess } from '../server/provider-access.ts';

test('wallet permission denial is unknown credit availability, not an invalid translation key', async () => {
  let walletStatus = 403;
  const methods: string[] = [];
  const paths: string[] = [];
  const server = createServer((request, response) => {
    methods.push(request.method!);
    paths.push(request.url!);
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/integration/credits') {
      response.statusCode = walletStatus;
      response.end(JSON.stringify({ remainingCredits: 7, privateDiagnostic: 'do not expose' }));
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const provider = new Provider('fixture-key', origin);
    const denied = await checkProviderAccess(provider, AbortSignal.timeout(5000));
    assert.equal(denied.keyAccepted, null);
    assert.equal(denied.walletAccessible, false);
    assert.equal(denied.billingPermissionRequired, true);
    assert.equal(denied.creditsAvailable, null);
    walletStatus = 200;
    assert.equal(
      (await checkProviderAccess(provider, AbortSignal.timeout(5000))).creditsAvailable,
      true,
    );
    walletStatus = 401;
    await assert.rejects(
      checkProviderAccess(provider, AbortSignal.timeout(5000)),
      (error) => error instanceof ProviderError && error.code === 'provider_auth',
    );
    assert.ok(methods.every((method) => method === 'GET'));
    assert.deepEqual(paths, Array(3).fill('/integration/credits'));
    assert.equal(JSON.stringify(denied).includes('do not expose'), false);
    assert.equal(JSON.stringify(denied).includes('fixture-key'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
