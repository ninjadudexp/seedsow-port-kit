# Architecture

## The port in one picture

```
 console (Switch 2, 23.0.1)                     PC
 ┌───────────────────────────────┐      ┌──────────────────────────────┐
 │ SeedSow demo + Lua Editor save│      │ tools/preflight.cjs          │
 │   → Lua runtime (n2h)         │      │ tools/deploy-bridge.cjs      │
 │   → nora2hax HTTP :8080 /eval │◄─────┤   POST bridge/nora_bridge.lua│
 │                               │      │                              │
 │ nora_bridge.lua               │      │ tools/run-port.cjs           │
 │   socket/bind/listen :39385   │◄─────┤   engine connects IN         │
 │   RPC loop (BRIDGE-CONTRACT)  │      │   ns2jb Stage-2 engine       │
 └───────────────┬───────────────┘      └──────────────────────────────┘
                 │ same attack semantics as CivSwitch
                 ▼
        fs sysmodule: reserved-gap race → cache alias → retained → RO
```

## Why the delta is small

Everything above the transport is the engine we already validated on this console with the
Civ entry. Two entry-specific facts define the port:

1. **Direction is reversed.** `n2h` exposes sockets but no `connect()`, so the console
   `bind`s/`listen`s and the PC connects in. Civ's bridge dials out instead.
2. **The eval call blocks.** The bridge occupies the entry's Lua thread for the whole
   session, so deployment is confirmed by observing the console-side listener, not by an
   HTTP response. `deploy-bridge.cjs` therefore probes the listening port.

## Wire contract (unchanged from ns2jb)

| constant | value |
| --- | --- |
| request / response | `0x8080` / `0x8010` bytes |
| scratch | `0x80000` |
| request lands at | scratch + `0x40000` |
| record B offset | `0x28` (record A at `0x00`) |
| result B / result A | `0x4030` / `0x4038` |
| output area | scratch + `0x4040` |

## Exit-code contract

| code | meaning |
| --- | --- |
| 0 | ready (preflight) / port verified (run) |
| 2 | usage or missing local prerequisite — fix before touching hardware |
| 3 | not ready (entry unreachable, no save archive) |
| 4 | inconclusive — something answered but not as expected; report, don't retry blindly |

The rule behind those codes: **a failure that is not evidence must never be reported as a
negative result.** Unreachable entry, odd HTTP status, and missing prerequisites are all
distinguished from "the chain does not work".
