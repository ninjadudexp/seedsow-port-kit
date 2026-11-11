# seedsow-port-kit

Port the **CivSwitch (Civ VII) → ns2jb Stage-2** chain onto the **SeedSow / nora2hax
("Ounce") Lua entry**, reusing the engine we already proved on this console.

This is the *port tool*, not another copy of the engine: it checks the SeedSow entry,
pushes the console-side bridge, drives the existing engine, and tells you exactly which
stage failed. Everything it touches is read-only until you explicitly run the engine.

## Why this exists

On 2026-11-11 the Civ entry reached `4/4 verified` (FS read/write, retained + RO payload)
on this console — the engine works. SeedSow is a *second* entry into the same FS chain,
with a Lua runtime and an HTTP surface, so it survives the case where Civ's boom-or-bust
acquisition wastes a boot.

The Civ→SeedSow delta is small and entirely **transport**:

| piece | Civ | SeedSow |
| --- | --- | --- |
| execution | chat-XSS → Remote JS Loader `:9026` | save-delivered Lua → `nora2hax` HTTP `:8080` |
| console bridge | `civ_bridge.js` (console dials PC `:39380`) | `nora_bridge.lua` (console **listens** `:39385`, PC dials in) |
| engine | ns2jb Stage-2, `target.civ7.json` | same engine, transport patched to connect out |
| attack semantics | unchanged | unchanged |

## Quick start

```sh
npm test                 # offline: preflight/parse/verdict logic, no console

node tools/preflight.cjs --host <CONSOLE_IP>
node tools/deploy-bridge.cjs --host <CONSOLE_IP> --port 8080
node tools/run-port.cjs --host <CONSOLE_IP> --engine ../seedsow-nora-kit/port/engine
```

`preflight` is read-only and safe to run any time. `deploy-bridge` posts
`bridge/nora_bridge.lua` to the entry's `/eval`; the console then listens and the engine
connects in. `run-port` checks the entry, starts the engine, deploys the bridge, and
summarises the run.

## Prerequisites

- Switch 2 on **23.0.1**, same wired L2 as the PC.
- SeedSow demo with the **Lua Editor save** loaded once (editor gives Lua + the game's
  own file access) and `nora2hax/seedsow` serving `/eval` on `:8080`.
- Node ≥ 20. An engine checkout (this kit does not vendor one).
- The title must have an existing save archive before anything writes to it.

## Layout

```
bridge/        console-side Lua bridge (vendored, provenance in docs/PROVENANCE.md)
config/        default ports/paths; override with flags or port.local.json
docs/          ARCHITECTURE.md, RUNBOOK.md, PROVENANCE.md
tools/         preflight, deploy-bridge, run-port, shared libs
tests/         offline tests (mock HTTP entry, mock engine output)
```

## Status

Scaffolding + offline-tested tooling. The SeedSow entry itself is **not yet validated on
this hardware** — `preflight` is the first thing to run, and it reports plainly rather
than guessing. See `docs/RUNBOOK.md` for the acceptance criteria.

## Licensing / credits

GPL-2.0 for this package. Upstream: `kurumuz/ns2jb` (GPL-2.0), `slapah/CivSwitch`,
`mza1010/civswitch-kit`, `ItsNerisma/CivSwitchLDN`, `DialingSpoon527/seedsow-lua-editor`
(MIT), `dougchansan/ns2-savekit`. Details in `NOTICE.md` and `docs/PROVENANCE.md`.
