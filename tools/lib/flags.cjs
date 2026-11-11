// Minimal `--flag value` / `--flag=value` / boolean-flag parser.
// Unknown flags are refused so a typo cannot silently change what a tool does.
const KNOWN = new Set(['host', 'port', 'engine', 'json', 'file', 'timeout', 'save-hint', 'dry-run',
  'console-port', 'bridge', 'verbose', 'help']);

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      (out._ ??= []).push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    const name = eq >= 0 ? body.slice(0, eq) : body;
    if (!KNOWN.has(name)) throw Error('unknown flag --' + name + ' (known: ' + [...KNOWN].join(', ') + ')');
    if (eq >= 0) { out[name] = body.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[name] = true; continue; }
    out[name] = next;
    i++;
  }
  return out;
}

module.exports = {parseFlags, KNOWN};
