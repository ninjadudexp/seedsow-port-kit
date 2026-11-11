#!/usr/bin/env node
// Orchestrate one port attempt: preflight -> engine -> deploy bridge -> summarise.
//
//   node tools/run-port.cjs [--host IP] [--engine DIR] [--console-port 39385]
//                           [--timeout 3600] [--dry-run]
//
// Acceptance is the engine's own report, not this tool's optimism:
//   verified=true  => 4/4 for this entry (FS read/write + retained + RO)
//   verified=false => the engine's error names the stage that failed
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {ROOT, EXIT, loadConfig} = require('./lib/common.cjs');
const {parseFlags} = require('./lib/flags.cjs');

function runTo(command, args, options, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe'], ...options});
    const collect = stream => {
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        buf += chunk;
        let at;
        while ((at = buf.indexOf('\n')) >= 0) {
          onLine(buf.slice(0, at));
          buf = buf.slice(at + 1);
        }
      });
      stream.on('end', () => { if (buf) onLine(buf); });
    };
    collect(child.stdout);
    collect(child.stderr);
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({code, signal}));
  });
}

/** Parse the engine's run folder + result.json the same way its own wrapper does. */
function readEngineResult(runDir) {
  const resultFile = path.join(runDir, 'result.json');
  if (!fs.existsSync(resultFile)) return null;
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  return {
    verified: Boolean(result.verified),
    error: result.error || null,
    fsVerified: Boolean(result.fs?.verified),
    fsPid: result.fs?.pid ?? null,
    trials: result.fs?.trials ?? null,
    restored: result.fs?.restored ?? null,
    rpc: result.rpc || null,
    firmwareDump: result.firmwareDump
      ? {complete: Boolean(result.firmwareDump.complete), entries: result.firmwareDump.entries?.length ?? 0}
      : null,
  };
}

/** Verdict from an engine result object; pure, so it is testable offline. */
function runVerdict(result) {
  if (!result) return {state: 'no-result', detail: 'the engine wrote no result.json (it never connected?)'};
  if (result.verified) return {state: 'port-verified',
    detail: '4/4: FS read/write verified' + (result.restored ? ', restored' : '') +
      (result.rpc?.state === 'listening' ? ', session held' : '')};
  return {state: 'not-verified', detail: result.error || 'engine reported failure without an error string'};
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const cfg = loadConfig();
  const host = flags.host || cfg.entry.host;
  if (!host) {
    console.error('no console address: pass --host <ip> or set entry.host in config/port.local.json');
    return EXIT.USAGE;
  }
  const engineDir = path.resolve(flags.engine || cfg.engine.directory);
  const bridgePort = Number(flags['console-port'] || flags.bridge || cfg.bridge.listenPort);
  const engineEntry = path.join(engineDir, 'run.cjs');
  if (!fs.existsSync(engineEntry)) {
    console.error('engine not found: ' + engineEntry + ' (pass --engine <dir>)');
    return EXIT.USAGE;
  }
  console.log('run-port: engine=' + engineDir + ' console=' + host + ':' + bridgePort);
  if (flags['dry-run']) {
    console.log('dry-run: would start the engine and deploy the bridge');
    return EXIT.OK;
  }

  // The engine must be listening BEFORE the bridge is deployed (the console dials in).
  let runDir = null;
  const engineArgs = ['run.cjs', '--console', host, '--port', String(bridgePort)];
  for (const arg of (cfg.engine.connectFlags || [])) engineArgs.push(arg);
  console.log('engine: ' + path.basename(engineEntry) + ' ' + engineArgs.slice(1).join(' '));
  const engine = runTo(process.execPath, engineArgs, {cwd: engineDir}, line => {
    const match = /Run folder:\s*(.+)$/.exec(line);
    if (match) runDir = match[1].trim();
    if (/4\/4 verified|error|failed/i.test(line)) console.log('  engine| ' + line);
  });
  await engine.then(({code, signal}) => {
    if (signal) console.log('engine stopped by ' + signal);
    else console.log('engine exit=' + code);
  });

  const result = runDir ? readEngineResult(runDir) : null;
  const verdict = runVerdict(result);
  console.log('run folder : ' + (runDir || '(none)'));
  console.log('verdict    : ' + verdict.state);
  console.log('detail     : ' + verdict.detail);
  if (result?.firmwareDump) {
    console.log('firmware   : ' + (result.firmwareDump.complete ? 'complete' : 'incomplete') +
      ' (' + result.firmwareDump.entries + ' entries)');
  }
  if (verdict.state === 'port-verified') {
    console.log('next: keep the session open and run savekit/BIS tools against ' + runDir);
    return EXIT.OK;
  }
  return verdict.state === 'no-result' ? EXIT.INCONCLUSIVE : EXIT.NOT_READY;
}

if (require.main === module) {
  main().then(code => process.exit(code)).catch(error => {
    console.error('run-port failed: ' + error.message);
    process.exit(EXIT.INCONCLUSIVE);
  });
}

module.exports = {runVerdict, readEngineResult};
