# Runbook

## 0. One-time console preparation

1. **Save archive must exist.** Load the Lua Editor save once on the demo, then make one
   ordinary save. Save-data APIs cannot create a title's archive container; tools can only
   write *into* an existing one.
2. Note the console's LAN IP (wired dock strongly preferred — this chain is timing
   sensitive).

## 1. Preflight (safe, read-only)

```sh
npm test
node tools/preflight.cjs --host <CONSOLE_IP> --json runs/preflight.json
```

Exit 0 = ready. Exit 2 = fix the checkout. Exit 3 = the entry is not up (or no save
hint). Exit 4 = something answered but not as expected — read the report, don't retry
blindly.

## 2. Deploy the bridge

```sh
node tools/deploy-bridge.cjs --host <CONSOLE_IP> --dry-run   # size/limit check first
node tools/deploy-bridge.cjs --host <CONSOLE_IP>
```

Success = `console is listening on <ip>:39385`. The POST will not return while the bridge
runs; that is expected.

## 3. Drive the engine

```sh
node tools/run-port.cjs --host <CONSOLE_IP> --engine <engine-checkout>
```

Acceptance criteria (in order, all from the engine's own report):

1. `result.json` exists — otherwise the engine never connected (`no-result`, exit 4).
2. `verified: true` — 4/4: FS read/write verified, restored.
3. `rpc.state: "listening"` — the session is held, so save/BIS work can follow.
4. `firmwareDump.complete: true` — only if launched with the dump flag.

Anything else: read `detail`, keep the run folder, and restart the console before another
attempt.

## 4. After a verified run

- Copy the run folder out **before** starting another engine (a new start wipes the
  previous dump directory).
- Keep the game and the engine process alive while using the endpoint.
- Save writes are fenced: back up first, one transaction, verify by hash.

## Failure classes and what they mean

| symptom | class | action |
| --- | --- | --- |
| `entry-unreachable` | not ready | get SeedSow to the editor/nora2hax screen |
| `entry-http-<code>` | inconclusive | stop; the entry is not the one we expect |
| no listener after deploy | inconclusive | read the console screen; bridge may have errored inside eval |
| `no-result` from engine | inconclusive | engine never connected; check the console-side listener |
| engine `verified: false` | lottery / stage failure | restart console, restore save, re-roll |
| `verified: true` | success | hold the session; do the work |

## Do not

- Do not run two endpoint tools at once — the console side is single-threaded
  (`Another memory request is active`).
- Do not write `.nx_save_meta.bin` into a save archive: it is container metadata.
- Do not treat a wedged console as a measurement; power-cycle and re-roll.
