// Shared helpers: config loading, HTTP entry client, and small pure predicates.
// Everything here is console-free so it is unit-testable offline.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadConfig(overrides = {}) {
  let base = {};
  try {
    base = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'port.json'), 'utf8'));
  } catch { /* defaults below */ }
  try {
    const local = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'port.local.json'), 'utf8'));
    base = deepMerge(base, local);
  } catch { /* optional */ }
  return deepMerge(base, overrides);
}

function deepMerge(a, b) {
  if (!b || typeof b !== 'object') return a;
  const out = Array.isArray(a) ? [...a] : {...a};
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k] || {}, v) : v;
  }
  return out;
}

/** POST a Lua body to the entry's eval path. Resolves {status, body}. */
function evalLua(host, httpPort, evalPath, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
    const req = http.request({
      host, port: httpPort, path: evalPath, method: 'POST', timeout: timeoutMs,
      headers: {'content-type': 'text/x-lua; charset=utf-8', 'content-length': payload.length},
    }, res => {
      const parts = [];
      res.on('data', part => parts.push(part));
      res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(parts).toString('utf8')}));
    });
    req.on('timeout', () => req.destroy(Error('entry request timed out after ' + timeoutMs + 'ms')));
    req.on('error', reject);
    req.end(payload);
  });
}

/** Plain GET, used by preflight to identify the entry without evaluating anything. */
function get(host, httpPort, target, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = http.request({host, port: httpPort, path: target, method: 'GET', timeout: timeoutMs},
      res => {
        const parts = [];
        res.on('data', part => parts.push(part));
        res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(parts).toString('utf8')}));
      });
    req.on('timeout', () => req.destroy(Error('entry GET timed out after ' + timeoutMs + 'ms')));
    req.on('error', reject);
    req.end();
  });
}

/** Exit codes are the contract: 0 ready, 2 usage/config, 3 not-ready, 4 inconclusive. */
const EXIT = {OK: 0, USAGE: 2, NOT_READY: 3, INCONCLUSIVE: 4};

/**
 * Verdict for preflight. Pure, so the rules are testable without a console.
 * probe: { reachable, status, body, bridgePresent, enginePresent, saveHint }
 */
function preflightVerdict(probe) {
  if (!probe.reachable) return {code: EXIT.NOT_READY, state: 'entry-unreachable',
    detail: 'nothing is listening on the entry port: is SeedSow at the editor/nora2hax screen?'};
  if (probe.status !== 200) return {code: EXIT.INCONCLUSIVE, state: 'entry-http-' + probe.status,
    detail: 'the entry answered with HTTP ' + probe.status + '; report this rather than retrying blindly'};
  if (!probe.bridgePresent) return {code: EXIT.USAGE, state: 'bridge-missing',
    detail: 'bridge/nora_bridge.lua is missing from this checkout'};
  if (!probe.enginePresent) return {code: EXIT.USAGE, state: 'engine-missing',
    detail: 'engine directory not found; pass --engine <path> to a checkuot with run.cjs'};
  if (!probe.saveHint) return {code: EXIT.NOT_READY, state: 'no-save-archive-hint',
    detail: 'the title needs an existing save archive before any write; make one save in game'};
  return {code: EXIT.OK, state: 'ready', detail: 'entry, bridge, engine and save hint all present'};
}

/** True when a body looks like the nora2hax eval surface rather than an unrelated server. */
function looksLikeEntry(body) {
  const text = String(body || '').toLowerCase();
  return text.includes('nora') || text.includes('eval') || text.includes('lua') || text.includes('seedsow');
}

module.exports = {ROOT, EXIT, loadConfig, deepMerge, evalLua, get, preflightVerdict, looksLikeEntry};
