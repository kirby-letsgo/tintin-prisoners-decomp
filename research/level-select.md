# Level select

The original scene directory is in ROM bank 6 at `$471C`, with 32 records of
10 bytes. Each record has a two-byte scene-data pointer, a four-character scene
code, and introduction/chapter data. IDs 0–30 are supported scene starts. The UI groups them into 16 main levels,
using scene IDs 0, 5, 6, 10, 11, 12, 14, 17, 20, 21, 22, 23, 24, 25, 29, and 30.
Only the first area of each main level appears in the selector. ID 31 (`FINI`)
returns to the title/ending path and is deliberately excluded. UI names describe
the captured scenes; they are not claimed to be original published level names.

`$FFE8` is the scene index. The normal new-game path reads it at `00:0A58`, then
stores index-minus-one into `$DF62` and `$DFCA`. At `00:24D2` the loader compares
`$DFCA` with `$FFE8`; equality skips the chapter introduction. The directory lookup
uses `00:1CE5` (index × 10) and `00:1AD7` (bank-6 byte read).

A one-shot host request overrides the scene read at `00:0A58` and the introductory
comparison value written at `00:0A5E`. `$DF62` retains the original scene-minus-one
value for entry/spawn logic. The request clears after the latter write. The CPU's
original ticks, flags, safepoints, and loader remain in place. Without a request,
these helpers return the original values and do not write guest memory.

Most scenes use the loop `01:2661`. The car chase (11) uses `02:6933`, snow (22)
uses `02:40BE`, and the eclipse puzzle (29) has a distinct initializer leading to
`02:6126`. Its newspaper screen is part of the puzzle, not the skipped introduction.
Character dialogue within a level remains intact.

`tt_start_level` creates a fresh context from the current verified ROM, drives
the established opening input route, and waits 180 tick intervals after the request
is consumed. Initialization is bounded to 5,000 ticks. It checks the selected scene
before accepting the new context; otherwise it destroys the candidate and restores
the old context. No save-state structures or ROM bytes are modified.

The Rust command runs on a blocking worker under the existing core mutex. It saves
the previous run before changing levels. Existing manual saves are untouched;
normal autosaving subsequently tracks the new level. The selected starting-lives
preference is applied through the existing new-game initializer. Choosing a level
starts it fresh; it does not claim to restore plot flags earned in earlier levels.

## Verification

```sh
CFLAGS=-O0 CARGO_BUILD_JOBS=3 cargo test --locked \
  --manifest-path app/src-tauri/Cargo.toml --features asset-capture \
  level_select_route -- --ignored --nocapture
```

This local-ROM regression checks every selectable scene, nonblank rendered output,
nine starting lives, invalid IDs, and save restoration. Captures stay under ignored
`logs/level-select-test/<process-id>/`. Set `TT_LEVEL_SCENE` to a single ID
(0–30) to run independent cases in separate processes. `level-select-evidence.json` records scene identities and
frame hashes. Native captures were inspected as a contact sheet, including the
special stages. This verifies level entry and save restoration, not completion of
every level or every possible inter-level story transition.

The initial temporary browser harness using mocked native commands verified the
original 31-option selector,
scene 22 invocation for Snow, game-only display after launch, and autosave before
returning to the main menu. The production TypeScript/Vite build is checked too.

After regenerating, apply `level-select.patch` after the existing options and
presentation patches, then record the source manifest.
