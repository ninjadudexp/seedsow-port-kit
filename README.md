# seedsow-port-kit

Use SeedSow as a **second way in** to the same Switch 2 filesystem access you already get
from Civ VII. If you have the Civ entry working, this kit turns SeedSow into a backup door.

**You do not need anything special in SeedSow to start.** Any normal save is enough — this
kit installs the Lua Editor save for you.

---

## Which situation are you in?

### ✅ A. I already have Civ VII at 4/4 (most people)

Then you are already inside the console's filesystem. Skip every "getting started" step and
go to **[Path A](#path-a--you-are-already-in-44)** below. You do not need SeedSow running,
and you do not need the SeedSow bridge yet.

### 🅱 B. I am starting from nothing

You need one working entry first — Civ VII (chat XSS) **or** SeedSow with an existing game
save. This kit cannot create an entry from nothing; it builds on one.

---

## What you need

| Thing | Detail |
| --- | --- |
| Console | Switch 2, firmware **23.0.1** — do not update |
| SeedSow | the **demo** is enough (full game not required) |
| SeedSow save | **at least one ordinary save**, so the save file exists |
| PC | Node.js 20+, wired to the same network as the console |
| Engine | a copy of the ns2jb Stage‑2 engine (this kit does not bundle one) |

That's it. The Lua Editor save, the bridge and the save data are installed *by this kit*.

---

## Path A — you are already in 4/4

You have a run folder from the Civ attempt (`…runs/switch2-XXXXXX`) and the engine is still
running. **Do not close the game or the engine window.**

### A1. Find the console's user ID and back up SeedSow's save

Run these one at a time — the console handles **one request at a time**.

```sh
# where is SeedSow's save, and its user id?
node tools/save-inventory.cjs <RUN_FOLDER> --names
```

Look for `Seedsow Lullaby (demo)` → `app=0x010042d022aea000`, and copy its full `uid`
(32 hex characters).

```sh
# back it up BEFORE anything is written (this is the undo button)
node tools/save-pull-root.cjs <RUN_FOLDER> 010042d022aea000 <BACKUP_DIR> <UID>
```

### A2. Install the Lua Editor save into SeedSow

```sh
node tools/save-write-stage.cjs <RUN_FOLDER> 010042d022aea000 <UID> <BACKUP_DIR> <MANIFEST>
```

`<MANIFEST>` is a small JSON listing the editor's files (path, local file, size, sha256,
and `replace: true` only for files that exist in `<BACKUP_DIR>`). Every file is written in
one transaction and re-read to verify.

### A3. Test it

Close Civ VII, start **SeedSow demo**, load **slot 1**. If the editor appears, you now have
a second entry and the session's job is done. If it doesn't, restore `<BACKUP_DIR>` and
re-read [Troubleshooting](#troubleshooting).

> Once SeedSow boots the editor, the Civ session is no longer needed — you can reboot.

---

## Path B — starting cold

### B1. Make a save in SeedSow

Open the demo, start a new game, make one ordinary save in an empty slot, close the game.
This only creates the save file — its content does not matter, because the editor save will
replace it.

### B2. Get an entry that runs Lua or JS

SeedSow needs something that executes your code. Two options:

- **nora2hax / seedsow** — gives an HTTP surface on `:8080` that runs Lua (`POST /eval`).
- **the SeedSow Lua Editor save** — gives Lua inside the game. Load slot 1, then paste and
  run `bridge/nora_bridge.lua` (see [Running the bridge without HTTP](#running-the-bridge-without-http)).

### B3. Check everything is ready (safe, read-only)

```sh
node tools/preflight.cjs --host <CONSOLE_IP>
```

Exit code `0` = ready. `2` = something missing on your PC. `3` = the console entry isn't
answering. `4` = something answered but not as expected — read the message, don't retry.

---

## Running the bridge

The bridge is the console-side half. After it starts, the console **listens** on port
`39385` and the PC engine connects in.

### With nora2hax (HTTP)

```sh
node tools/deploy-bridge.cjs --host <CONSOLE_IP> --dry-run   # sanity check, sends nothing
node tools/deploy-bridge.cjs --host <CONSOLE_IP>
```

Success looks like: `deployed: console is listening on <CONSOLE_IP>:39385`.
The upload itself never "finishes" — the bridge keeps running inside it. That's normal.

### Running the bridge without HTTP

If you only have the editor: open it, load `bridge/nora_bridge.lua` as a program (or paste
it in) and run it. The console will listen on `:39385` exactly the same way.

---

## Driving the engine

```sh
node tools/run-port.cjs --host <CONSOLE_IP> --engine <ENGINE_FOLDER>
```

`<ENGINE_FOLDER>` is a folder containing `run.cjs`.

You want this line:

```
verdict    : port-verified
detail     : 4/4: FS read/write verified, restored, session held
```

Anything else, read `detail` and see [Troubleshooting](#troubleshooting).

---

## Troubleshooting

| What you see | What it means | What to do |
| --- | --- | --- |
| `entry-unreachable` | nothing is listening | get SeedSow to the editor / nora2hax screen |
| `entry-http-404` (or other codes) | it's answering, but not as an entry | stop; this isn't the right server |
| `no listener on …:39385` | the bridge didn't start | read the console screen; the Lua may have errored |
| `Another memory request is active` | two tools ran at once | run them one at a time |
| engine `verified: false` | this boot didn't win | restart the console, restore the save, try again |
| console freezes | normal for this chain | hold power ~12 s, restart, try again |

The chain is a **race**, not a deterministic exploit: roughly one boot in three works with
Civ. Retrying is normal, not a sign you did something wrong.

---

## Layout

```
bridge/    console-side Lua bridge
config/    ports and paths (put your own values in port.local.json — it is gitignored)
docs/      ARCHITECTURE.md, RUNBOOK.md, PROVENANCE.md
tools/     preflight, deploy-bridge, run-port
tests/     offline tests — no console needed
```

## Tests

```sh
npm test        # 11 checks, no hardware
```

## Licence and credits

GPL-2.0-only, matching the engine it drives. Upstream work and per-file provenance are in
`NOTICE.md` and `docs/PROVENANCE.md`.

This kit ships **no** keys, save data, game content, or console dumps.
