# Runbook

Two routes. Pick the one that matches you — most people start at Route A.

- **Route A:** Civ VII is already bridged at 4/4 and the engine window is still open.
- **Route B:** nothing is running yet.

Throughout: replace `<CONSOLE_IP>`, `<PC_IP>`, `<RUN_FOLDER>`, `<UID>`, `<BACKUP_DIR>`,
`<ENGINE_FOLDER>` with your own values. Nothing here contains real addresses.

---

## Route A — you are already in 4/4

Prerequisites: the game is open, the engine window says it is listening, and you are **not
restarting anything** during these steps.

### A.0 One-time assumptions

- SeedSow demo has **at least one ordinary save** (its save file must already exist).
- Your `ns2-savekit` checkout is ready (it holds the save tools used below).

### A.1 Read the save list (read-only)

```sh
node tools/save-inventory.cjs <RUN_FOLDER> --names
```

Find the line with `Seedsow Lullaby (demo)`:

```
id=… Account app=0x010042d022aea000 uid=<32 hex chars> size=…
```

Copy the **full 32-character uid**. Do not use the shortened uid some screens print.

### A.2 Back up the current save (this is your undo button)

```sh
node tools/save-pull-root.cjs <RUN_FOLDER> 010042d022aea000 <BACKUP_DIR> <UID>
```

Check it worked: `<BACKUP_DIR>` should contain `save0001.dat`, `system.dat`,
`saveg.dat`, `autosave.dat` and a `manifest.json`.

**If this step fails, stop.** Do not write anything without a backup.

### A.3 Install the Lua Editor save

```sh
node tools/save-write-stage.cjs <RUN_FOLDER> 010042d022aea000 <UID> <BACKUP_DIR> <MANIFEST>
```

Rules the tool enforces, and why:

- only whitelisted disposable titles (SeedSow demo is built in);
- every file must either already exist in `<BACKUP_DIR>` (`replace: true`) or be new;
- one open, one commit, then every file is read back and hashed.

Do **not** include `.nx_save_meta.bin` in the manifest — it is container metadata, not game
data, and rewriting it can break the save.

### A.4 Verify from the console side

```sh
node tools/save-pull-root.cjs <RUN_FOLDER> 010042d022aea000 <BACKUP_DIR>-after <UID>
```

You should see roughly 270 files instead of the original handful.

### A.5 Test the entry

1. Close Civ VII.
2. Start **SeedSow demo** → load **slot 1**.
3. The Lua Editor should appear.

If it appears: you now have a second entry, and you can reboot. Nothing else is required.

If it does not: restore from `<BACKUP_DIR>` and read
[Restoring](#restoring-a-save) before trying again.

---

## Route B — starting cold

### B.1 Create SeedSow's save file

Demo → New Game → get past the opening → open the save menu → save to an empty slot →
close the game. Content is irrelevant; this only creates the archive.

> No save archive = nothing any tool can write into. This is the single most common
> blocker.

### B.2 Give SeedSow a way to run code

Either:

- **nora2hax / seedsow** — HTTP on `:8080`, `POST /eval` runs Lua, or
- **the Editor save** (Route A or the upstream JKSV route) — Lua inside the game.

### B.3 Preflight

```sh
node tools/preflight.cjs --host <CONSOLE_IP> --json runs/preflight.json
```

| exit | meaning | action |
| --- | --- | --- |
| 0 | ready | continue |
| 2 | local prerequisite missing (bridge file, engine folder, no `--host`) | fix on the PC |
| 3 | entry not answering | get SeedSow to the editor/nora2hax screen |
| 4 | answered, but not as expected | stop and read the report — this is not a "no" |

### B.4 Start the bridge

With nora2hax:

```sh
node tools/deploy-bridge.cjs --host <CONSOLE_IP> --dry-run
node tools/deploy-bridge.cjs --host <CONSOLE_IP>
```

Without HTTP (editor only): load `bridge/nora_bridge.lua` in the editor and run it.

Expected: `console is listening on <CONSOLE_IP>:39385`.

### B.5 Run the engine

```sh
node tools/run-port.cjs --host <CONSOLE_IP> --engine <ENGINE_FOLDER>
```

Success looks like:

```
verdict    : port-verified
detail     : 4/4: FS read/write verified, restored, session held
```

---

## After a successful run

1. **Copy the run folder somewhere safe** before starting anything else — a new engine start
   wipes the previous dump directory.
2. Keep the game open and the engine window open while you use the console.
3. Run endpoint tools **one at a time** — the console is single-threaded.
4. Hold sessions do not survive a reboot. Only the *entry* (the save) does.

---

## Restoring a save

If a write looks wrong or the game misbehaves:

```sh
node tools/save-write-stage.cjs <RUN_FOLDER> 010042d022aea000 <UID> <BACKUP_DIR> <MANIFEST_FROM_BACKUP> --restore --confirm-restore
```

`--restore` is deliberately gated: it overwrites live bytes that differ from the backup, so
it needs the second flag to confirm you meant it.

---

## Failure classes

| symptom | class | action |
| --- | --- | --- |
| `entry-unreachable` | not ready | reach the entry screen |
| `entry-http-<code>` | inconclusive | stop; wrong server or wrong port |
| no `:39385` listener | inconclusive | check the console screen; Lua may have errored |
| engine `no-result` | inconclusive | engine never connected — is the console listening? |
| engine `verified: false` | race lost / stage failed | restart console, restore save, re-roll |
| wedge / frozen screen | normal for this chain | hold power ~12 s, restart |

**Why retrying is expected:** acquisition is a heap race inside the filesystem process. On
this console roughly one boot in three succeeds with the Civ entry. A failed boot is not a
bug report.

---

## Don't

- Don't run two console tools at once.
- Don't write `.nx_save_meta.bin`.
- Don't trust the on-screen "Executed successfully" — it means the connection closed
  normally, not that the chain worked. Trust `verified`.
- Don't put console dumps, saves or PRODINFO in a git repo.
