// Offline tests: no console, no engine. Exercises the pure verdict rules, the flag parser,
// the config merge, the entry client (against a local mock), and the engine-result reader.
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const {EXIT, loadConfig, deepMerge, evalLua, get, preflightVerdict, looksLikeEntry} =
  require('../tools/lib/common.cjs');
const {parseFlags} = require('../tools/lib/flags.cjs');
const {runVerdict, readEngineResult} = require('../tools/run-port.cjs');

const tests = [];
const test = (name, fn) => tests.push({name, fn});

test('preflight: unreachable entry is NOT_READY, never "ready"', () => {
  const v = preflightVerdict({reachable: false});
  assert.strictEqual(v.code, EXIT.NOT_READY);
  assert.strictEqual(v.state, 'entry-unreachable');
});

test('preflight: non-200 is INCONCLUSIVE, not a retry signal', () => {
  const v = preflightVerdict({reachable: true, status: 404, bridgePresent: true, enginePresent: true, saveHint: true});
  assert.strictEqual(v.code, EXIT.INCONCLUSIVE);
  assert.match(v.state, /entry-http-404/);
});

test('preflight: missing bridge/engine are USAGE errors before any console work', () => {
  assert.strictEqual(preflightVerdict({reachable: true, status: 200, bridgePresent: false,
    enginePresent: true, saveHint: true}).code, EXIT.USAGE);
  assert.strictEqual(preflightVerdict({reachable: true, status: 200, bridgePresent: true,
    enginePresent: false, saveHint: true}).code, EXIT.USAGE);
});

test('preflight: no save archive is NOT_READY with the reason stated', () => {
  const v = preflightVerdict({reachable: true, status: 200, bridgePresent: true,
    enginePresent: true, saveHint: false});
  assert.strictEqual(v.code, EXIT.NOT_READY);
  assert.match(v.detail, /save archive/);
});

test('preflight: all present is OK', () => {
  const v = preflightVerdict({reachable: true, status: 200, bridgePresent: true,
    enginePresent: true, saveHint: true});
  assert.strictEqual(v.code, EXIT.OK);
  assert.strictEqual(v.state, 'ready');
});

test('flags: values, =form, booleans, and unknown-flag refusal', () => {
  assert.deepStrictEqual(parseFlags(['--host', '1.2.3.4', '--port=8080', '--dry-run']),
    {host: '1.2.3.4', port: '8080', 'dry-run': true});
  assert.throws(() => parseFlags(['--hosst', 'x']), /unknown flag/);
});

test('config: deep merge keeps sibling defaults', () => {
  const merged = deepMerge({entry: {host: 'a', httpPort: 8080}}, {entry: {host: 'b'}});
  assert.deepStrictEqual(merged, {entry: {host: 'b', httpPort: 8080}});
  const cfg = loadConfig();
  assert.ok(cfg.entry.httpPort && cfg.bridge.listenPort && cfg.engine.directory);
});

test('entry client: GET and POST round-trip against a local mock', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const parts = [];
    req.on('data', part => parts.push(part));
    req.on('end', () => {
      seen.push({method: req.method, url: req.url, body: Buffer.concat(parts).toString('utf8')});
      res.writeHead(200, {'content-type': 'text/plain'});
      res.end('ok nora eval lua');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const index = await get('127.0.0.1', port, '/');
  assert.strictEqual(index.status, 200);
  assert.ok(looksLikeEntry(index.body));
  const posted = await evalLua('127.0.0.1', port, '/eval', 'print("hi")');
  assert.strictEqual(posted.status, 200);
  assert.deepStrictEqual(seen.map(s => s.method + ' ' + s.url), ['GET /', 'POST /eval']);
  assert.strictEqual(seen[1].body, 'print("hi")');
  server.close();
});

test('entry client: a refused connection rejects instead of pretending success', async () => {
  await assert.rejects(() => get('127.0.0.1', 1, '/', 1500), /ECONNREFUSED|timed out/);
});

test('verdict: engine result mapping (verified / failed / missing)', () => {
  assert.strictEqual(runVerdict({verified: true, restored: true, rpc: {state: 'listening'}}).state,
    'port-verified');
  const failed = runVerdict({verified: false, error: 'FS acquisition did not complete [x]'});
  assert.strictEqual(failed.state, 'not-verified');
  assert.match(failed.detail, /FS acquisition/);
  assert.strictEqual(runVerdict(null).state, 'no-result');
});

test('result reader: reads result.json and tolerates a missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spk-'));
  assert.strictEqual(readEngineResult(dir), null);
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({
    verified: true, fs: {verified: true, pid: '8', trials: 2, restored: true},
    rpc: {state: 'listening'}, firmwareDump: {complete: true, entries: new Array(90)},
  }));
  const result = readEngineResult(dir);
  assert.strictEqual(result.verified, true);
  assert.strictEqual(result.fsPid, '8');
  assert.strictEqual(result.firmwareDump.entries, 90);
  fs.rmSync(dir, {recursive: true, force: true});
});

(async () => {
  let failed = 0;
  for (const {name, fn} of tests) {
    try {
      await fn();
      console.log('  ok  ' + name);
    } catch (error) {
      failed++;
      console.log('  FAIL ' + name + '\n       ' + error.message);
    }
  }
  console.log('\nseedsow-port-kit: ' + (tests.length - failed) + '/' + tests.length + ' tests passed');
  process.exit(failed ? 1 : 0);
})();
