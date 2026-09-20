# Start reading here

The first readable game subsystem is [actor tile uploads](graphics.md).
[graphics_reference.c](graphics_reference.c) expresses that subsystem in ordinary
C; it is a semantic reference, not a replacement for the timing-sensitive code.
[graphics-evidence.json](graphics-evidence.json) records the local replay evidence.

The next recovered layer is [animation frame selection and staging](animation.md).
[animation_reference.c](animation_reference.c) shows the table lookup and record
decoding; [animation-evidence.json](animation-evidence.json) records verified loads.

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
git apply --unidiff-zero research/runtime-trace.patch
git apply --unidiff-zero research/game-options.patch
git apply --unidiff-zero research/sprite-presentation.patch
git apply --unidiff-zero research/level-select.patch
python3 tools/name_symbols.py
python3 tools/core_sources.py record
python3 tools/study_animation.py capture
```

Apply these patches only to freshly regenerated sources, in the order above.
The trace patch adds opt-in diagnostics; the options patches intentionally alter
new-game initialization when requested by the host. Keep all source changes
reviewable; none of these commands commits or pushes anything.

## Player options

[Starting lives](lives.md) documents the first intentional gameplay modification.
Frontend display shaders are independent of generated game code; see `app/src/display.ts`.

[2× sprite replacements](sprite-replacements.md) explains the independent HD compositor and authoring format.

[Level select](level-select.md) records the scene directory, startup hooks, and validation.
