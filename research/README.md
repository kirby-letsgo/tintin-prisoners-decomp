# Start reading here

The first readable game subsystem is [actor tile uploads](graphics.md).
[graphics_reference.c](graphics_reference.c) expresses that subsystem in ordinary
C; it is a semantic reference, not a replacement for the timing-sensitive code.
[graphics-evidence.json](graphics-evidence.json) records the local replay evidence.

## Layers of the project

| Layer | Location | What to read it for |
|---|---|---|
| React UI and player | `app/src/` | ROM picker, controls, frame/audio scheduling |
| Rust host | `app/src-tauri/src/` | Save integrity, commands, synchronization |
| Native bridge | `app/src-tauri/native/bridge.c` | Calls into the game and graphics capture |
| Generated guest game | `generated/tintin/tintin_funcs_*.c` | Original game instructions translated to C |
| Game Boy runtime | `generated/tintin/runtime/` | CPU/memory, graphics hardware, audio, banking |
| Reviewed game knowledge | `research/` | Names, semantics, evidence and open questions |

A generated `body_*` is a dispatchable instruction region and can contain several
original entry points. It is not necessarily one original function. The aggressive
scan also emits entry points in instruction operands and data. For example, some
apparent instructions inside the bytes of `LD ($2000),A` are not part of its real
linear execution. Do not assign game-level meaning just from a generated name.

## Making more code readable

1. Pick one observable behavior and a short deterministic replay.
2. Trace the addresses and data that implement it.
3. Confirm the instruction boundaries and semantics against the ROM and output.
4. Add an address-keyed name to `symbols.json`, then run `tools/name_symbols.py`.
5. Write a short reference routine with explicit assumptions and limitations.
6. Replay and compare output before considering a functional replacement.

Reformatting the whole generated tree or removing its `gb_tick`, `ctx->pc`, flags,
and safepoint machinery is not a semantic cleanup. Those operations maintain guest
hardware timing and allow interrupts and save/restore at the expected points.

## After intentionally regenerating

Regeneration overwrites reviewed names and local runtime instrumentation. Reapply:

```sh
git apply research/runtime-trace.patch
python3 tools/name_symbols.py
python3 tools/core_sources.py record
python3 tools/study_graphics.py capture
```

Apply the patch only to freshly regenerated, unpatched runtime sources. It changes
opt-in diagnostic fields, not memory writes or execution. Keep all source changes
reviewable; none of these commands commits or pushes anything.
