# Provenance

This kit orchestrates existing work; it vendors one file and reuses others at runtime.

| piece | origin | licence | how used here |
| --- | --- | --- | --- |
| `bridge/nora_bridge.lua` | `seedsow-nora-kit/port/nora/nora_bridge.lua` (this vault), itself derived from `mza1010/civswitch-kit`'s `civ_bridge.js` ↔ ns2jb wire contract | GPL-2.0 | vendored verbatim |
| Stage-2 engine | `kurumuz/ns2jb` via `slapah/CivSwitch` and `mza1010/civswitch-kit` | GPL-2.0 | referenced by path (`--engine`), not vendored |
| SeedSow Lua Editor save | `DialingSpoon527/seedsow-lua-editor` | MIT | installed outside this repo (save payload) |
| Save/BIS tooling | `dougchansan/ns2-savekit` + local port | see upstream | separate tool; produces the backups this kit's runbook requires |
| entry (`nora2hax`/`seedsow`) | user-supplied | — | not included |

## What was changed versus upstream

- Bridge: none (vendored).
- Engine: none in this repo. Transport patches to make the engine *connect out* live in the
  engine checkout (see `docs/ARCHITECTURE.md`); this kit never edits the engine.

## Deliberate omissions

- No keys, no game content, no exploit binaries, no entry implementation.
- No `.nx_save_meta.bin` staging: container metadata is not ours to rewrite.

## Credit

Chain research: `kurumuz` (ns2jb), `Gezine` (CivSwitch), `slapah` (CivSwitch port),
`mza1010` (civswitch-kit patches + port notes), `ItsNerisma` (CivSwitchLDN),
`DialingSpoon527` (Seedsow Lua Editor), `dougchansan` (ns2-savekit), Kinnay (LDN library).
