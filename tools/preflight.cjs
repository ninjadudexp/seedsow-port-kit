#!/usr/bin/env node
// Read-only readiness check for the SeedSow port. Touches nothing on the console:
// it GETs the entry, inspects local files, and prints a verdict with an exit code.
//
//   node tools/preflight.cjs [--host IP] [--port N] [--engine DIR] [--json PATH]
const fs = require('node:fs');
const path = require('node:path');
const {ROOT, EXIT, loadConfig, get, preflightVerdict, looksLikeEntry} = require('./lib/common.cjs');
const {parseFlags} = require('./lib/flags.cjs');

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const cfg = loadConfig(flags.host || flags.engine ? {
    ...(flags.host ? {entry: {host: flags.host}} : {}),
    ...(flags.engine ? {engine: {directory: flags.engine}} : {}),
  } : {});
  const host = flags.host || cfg.entry.host;
  if (!host) {
    console.error('no console address: pass --host <ip> or set entry.host in config/port.local.json');
    return EXIT.USAGE;
  }
  const port = Number(flags.port || cfg.entry.httpPort);
  const bridgeFile = path.join(ROOT, cfg.bridge.file);
  const engineDir = path.resolve(ROOT, cfg.engine.directory);

  const probe = {
    host, port,
    reachable: false, status: null, body: '',
    bridgePresent: fs.existsSync(bridgeFile),
    enginePresent: fs.existsSync(path.join(engineDir, 'run.cjs')),
    saveHint: Boolean(flags['save-hint'] === undefined ? true : flags['save-hint']),
  };
  try {
    const reply = await get(host, port, '/');
    probe.reachable = true;
    probe.status = reply.status;
    probe.body = reply.body;
  } catch (error) {
    probe.error = error.message;
  }

  const verdict = preflightVerdict(probe);
  console.log('seedsow-port-kit preflight');
  console.log('  entry      : ' + host + ':' + port + (probe.reachable ? ' (HTTP ' + probe.status + ')' : ' (no answer)'));
  if (probe.reachable && !looksLikeEntry(probe.body)) {
    console.log('  note       : the entry did not advertise nora/eval/lua in its index page');
  }
  console.log('  bridge     : ' + (probe.bridgePresent ? path.relative(ROOT, bridgeFile) : 'MISSING'));
  console.log('  engine     : ' + (probe.enginePresent ? engineDir : 'MISSING (' + engineDir + ')'));
  console.log('  verdict    : ' + verdict.state);
  console.log('  detail     : ' + verdict.detail);
  if (probe.error) console.log('  error      : ' + probe.error);

  const report = {at: new Date().toISOString(), host, port, probe, verdict};
  if (flags.json) {
    fs.mkdirSync(path.dirname(path.resolve(flags.json)), {recursive: true});
    fs.writeFileSync(path.resolve(flags.json), JSON.stringify(report, null, 2) + '\n');
    console.log('  report     : ' + path.resolve(flags.json));
  }
  return verdict.code;
}

main().then(code => process.exit(code)).catch(error => {
  console.error('preflight failed: ' + error.message);
  process.exit(EXIT.INCONCLUSIVE);
});
