// Runtime-only probes of the actual source. Strict type checking is a separate gate.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const http = require('node:http');
const Module = require('node:module');
const root = resolve(process.argv[2] || '.');
const ts = require(require.resolve('typescript', { paths: [root] }));
const filename = resolve(root, 'src/integrations/slack/slack-auth.ts');
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = new Module(filename, module); mod.filename = filename;
mod.paths = Module._nodeModulePaths(root); mod._compile(compiled, filename);
const { SlackOAuthHandler } = mod.exports;
const nativeFetch = global.fetch;
const config = { botToken: 'fixture-token', signingSecret: 'fixture-secret', clientId: 'fixture-id', clientSecret: 'fixture-client-secret', redirectUri: 'https://example.invalid/callback', timeout: 75 };
let reply, requests = 0;
const server = http.createServer((req, res) => {
  requests++; req.resume();
  res.writeHead(reply.status || 200, { 'content-type': 'application/json', connection: 'close' });
  if (reply.stall) { res.write('{'); return; }
  res.end(reply.raw === undefined ? JSON.stringify(reply.body) : reply.raw);
});
const holdout = [], anchors = [];
const good = () => ({ ok: true, access_token: 'fixture-access', team: { id: 'T1' }, authed_user: { id: 'U1', access_token: 'fixture-user' } });
async function check(list, name, fn) {
  try { await fn(); list.push({ name, passed: true }); }
  catch (err) { list.push({ name, passed: false, error: err.message }); }
}
async function run(response, method, expectation) {
  reply = response;
  const writes = [];
  const storage = { store: async (...args) => writes.push(args), retrieve: async () => null, delete: async () => {}, isExpired: async () => false };
  const handler = new SlackOAuthHandler(config, storage);
  let timer;
  const operation = method === 'exchangeCode'
    ? handler.exchangeCode('fixture-code', handler.getStateManager().generate())
    : method === 'refreshToken' ? handler.refreshToken('T1', 'fixture-refresh')
    : method === 'testToken' ? handler.testToken('fixture-token') : handler.revokeToken('fixture-token');
  // Independent watchdog prevents a broken body deadline from hanging the probe.
  try {
    const result = await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('probe watchdog expired')), 400); })]);
    await expectation(null, result, writes);
  } catch (err) { await expectation(err, undefined, writes); }
  finally { clearTimeout(timer); handler.cleanup(); server.closeAllConnections(); }
}
const invalid = async (err, result, writes) => {
  assert.equal(err?.code, 'INVALID_RESPONSE'); assert.equal(writes.length, 0);
  assert.equal(err.message.includes('fixture-access'), false);
};
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  global.fetch = (url, options) => nativeFetch(origin + new URL(url).pathname, options);
  try {
    for (const method of ['exchangeCode', 'refreshToken', 'revokeToken']) {
      await check(holdout, `${method}: body deadline`, () => run({ stall: true }, method, async err => {
        assert.equal(err?.name, 'AbortError');
      }));
    }
    await check(holdout, 'testToken: body deadline fails closed', () => run({ stall: true }, 'testToken', async (err, result) => { assert.ifError(err); assert.equal(result, false); }));
    for (const method of ['exchangeCode', 'refreshToken', 'revokeToken']) {
      await check(holdout, `${method}: reject non-2xx success body`, () => run({ status: 503, body: { ...good(), expires_in: 3600 } }, method, async (err, _, writes) => {
        assert.equal(err?.code, 'HTTP_ERROR'); assert.equal(writes.length, 0);
      }));
    }
    await check(holdout, 'testToken: reject non-2xx success body', () => run({ status: 503, body: { ok: true } }, 'testToken', async (err, result) => { assert.ifError(err); assert.equal(result, false); }));
    for (const body of [{ ...good(), access_token: '' }, { ...good(), team: { id: '' } }, { ...good(), authed_user: { access_token: 'fixture-user' } }]) {
      await check(holdout, `exchangeCode: invalid stored fields ${holdout.length}`, () => run({ body }, 'exchangeCode', invalid));
    }
    for (const expires_in of [0, -1, '3600', 1e99]) {
      await check(holdout, `refreshToken: invalid expiry ${expires_in}`, () => run({ body: { ok: true, access_token: 'fixture-access', expires_in } }, 'refreshToken', invalid));
    }
    await check(holdout, 'revokeToken: reject non-object JSON', () => run({ body: null }, 'revokeToken', invalid));
    await check(anchors, 'valid exchange preserves bot and user tokens', () => run({ body: good() }, 'exchangeCode', async (err, result, writes) => { assert.ifError(err); assert.equal(result.access_token, 'fixture-access'); assert.deepEqual(writes, [['T1','fixture-access'],['T1:user:U1','fixture-user']]); }));
    await check(anchors, 'valid refresh stores expiry', () => run({ body: { ok: true, access_token: 'fixture-access', expires_in: 3600 } }, 'refreshToken', async (err, result, writes) => { assert.ifError(err); assert.equal(writes[0][0], 'T1'); assert.equal(writes[0][1], 'fixture-access'); assert.ok(writes[0][2] instanceof Date && Number.isFinite(writes[0][2].getTime())); }));
    await check(anchors, 'valid revocation', () => run({ body: { ok: true } }, 'revokeToken', async err => assert.ifError(err)));
    await check(anchors, 'valid auth test', () => run({ body: { ok: true } }, 'testToken', async (err, result) => { assert.ifError(err); assert.equal(result, true); }));
    await check(anchors, 'provider error code retained', () => run({ body: { ok: false, error: 'invalid_auth' } }, 'revokeToken', async err => assert.equal(err?.code, 'invalid_auth')));
    await check(anchors, 'OAuth state remains single use', async () => {
      const h = new SlackOAuthHandler(config), state = h.getStateManager().generate();
      assert.equal(h.getStateManager().validate(state).valid, true);
      const before = requests; await assert.rejects(h.exchangeCode('fixture-code', state), { code: 'INVALID_STATE' }); assert.equal(requests, before); h.cleanup();
    });
    console.log(JSON.stringify({ holdout, anchors, requests, passed: holdout.every(x=>x.passed)&&anchors.every(x=>x.passed) }));
    process.exitCode = holdout.every(x=>x.passed)&&anchors.every(x=>x.passed) ? 0 : 1;
  } finally { global.fetch = nativeFetch; server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(err => { console.error(err); process.exitCode = 1; server.closeAllConnections(); server.close(); });
