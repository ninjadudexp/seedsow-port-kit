#!/usr/bin/env node
// Push the console-side Lua bridge to the SeedSow entry (/eval). The console then
// listens on cfg.bridge.listenPort and the PC engine connects IN.
//
//   node tools/deploy-bridge.cjs [--host IP] [--port 8080] [--file bridge/nora_bridge.lua]
//                                [--bridge 39385] [--dry-run]
//
// The bridge blocks inside eval for the whole session, so the entry's HTTP request is
// expected to run long: this tool reports "deployed" when the POST is accepted and the
// socket is up, not when the response arrives.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const {ROOT, EXIT, loadConfig, evalLua} = require('./lib/common.cjs');
const {parseFlags} = require('./lib/flags.cjs');

function probeListening(host, port, timeoutMs = 2000) {
  return new Promise(resolve => {
    const socket = net.createConnection({host, port});
    const done = ok => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const cfg = loadConfig(flags.host ? {entry: {host: flags.host}} : {});
  const host = flags.host || cfg.entry.host;
  if (!host) {
    console.error('no console address: pass --host <ip> or set entry.host in config/port.local.json');
    return EXIT.USAGE;
  }
  const port = Number(flags.port || cfg.entry.httpPort);
  const bridgePort = Number(flags.bridge || cfg.bridge.listenPort);
  const file = path.resolve(flags.file || path.join(ROOT, cfg.bridge.file));
  if (!fs.existsSync(file)) {
    console.error('bridge file not found: ' + file);
    return EXIT.USAGE;
  }
  const body = fs.readFileSync(file);
  const limit = Number(cfg.entry.bodyLimit || 0);
  if (limit && body.length > limit) {
    console.error('bridge is ' + body.length + ' bytes, above the entry body limit ' + limit);
    return EXIT.USAGE;
  }
  console.log('deploy: ' + path.relative(ROOT, file) + ' (' + body.length + ' bytes) -> ' +
    host + ':' + port + cfg.entry.evalPath);
  console.log('expect: console listens on :' + bridgePort + ' and the engine connects in');

  if (flags['dry-run']) {
    console.log('dry-run: nothing sent');
    return EXIT.OK;
  }

  // Fire the eval; do not await the response, because the bridge blocks inside it.
  let settled = null;
  const request = evalLua(host, port, cfg.entry.evalPath, body, 3600000)
    .then(reply => { settled = reply; return reply; })
    .catch(error => { settled = {error: error.message}; return settled; });

  // Wait for the console-side listener to appear.
  const deadline = Date.now() + Number(flags.timeout || 30000);
  let listening = false;
  while (Date.now() < deadline) {
    if (await probeListening(host, bridgePort)) { listening = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  request.then(() => {});
  if (listening) {
    console.log('deployed: console is listening on ' + host + ':' + bridgePort);
    console.log('next: node tools/run-port.cjs --host ' + host + ' --engine ' + cfg.engine.directory);
    return EXIT.OK;
  }
  console.error('no listener on ' + host + ':' + bridgePort + ' within ' +
    Number(flags.timeout || 30000) + 'ms');
  if (settled && settled.error) console.error('entry error: ' + settled.error);
  else if (settled) console.error('entry replied HTTP ' + settled.status + ': ' + String(settled.body).slice(0, 400));
  console.error('inconclusive: the bridge may have failed inside eval; read the console screen');
  return EXIT.INCONCLUSIVE;
}

main().then(code => process.exit(code)).catch(error => {
  console.error('deploy failed: ' + error.message);
  process.exit(EXIT.INCONCLUSIVE);
});
