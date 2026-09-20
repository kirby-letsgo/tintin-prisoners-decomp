# Development and research

Local native build of the Europe (English/French/German) Game Boy Color ROM using
[GB Recompiled](https://github.com/arcanite24/gb-recompiled).
This is generated machine-level C plus a Game Boy runtime, not a recovered original
source tree or a completed semantic decompilation. Unknown execution targets can
fall back to the runtime interpreter.

## Build and play

Requires Python 3, Git, CMake 3.20+, Ninja, SDL2 development files, and a C11/C++20
compiler. On macOS the dependencies can be installed with `brew install cmake ninja sdl2`.
Place the original ROM in `rom/`, then run:

```sh
make all          # verify ROM, fetch/build pinned tool, generate C, build, boot smoke
make run          # launch the native executable
```

Existing builds can be launched with `make run`. Arrow keys move, Z is A, X is B,
Enter is Start, Backspace is Select, and Escape opens settings.

Individual steps: `make verify-rom`, `make bootstrap`, `make generate`, `make build`,
`make smoke`, `make route`, `make differential`, `make test-tool`.
Re-running generation overwrites the generated C; keep researched symbols,
annotations, and future native replacements separately in version-controlled files.

## Layout

- `tools/project.py`: reproducible commands and exact ROM/tool identity checks.
- `.tools/gb-recompiled/`: pinned upstream checkout and tool build (ignored).
- `generated/tintin/`: tracked C sources, runtime snapshot and licenses. The full
  embedded ROM array and large analysis report remain ignored.
- `build/tintin/tintin`: native executable (ignored).
- `logs/`: build logs, captures, state dumps, and local saves (ignored).
- `research/`: reviewed routine names, readable references and replay evidence.

The ROM is 1 MiB, 64 banks, CGB-only, MBC5 without cartridge RAM, revision 0.
Its SHA-256 is `4c859ad08f74bcc004f01a69a7d380cdcdea79eb731a09f935337921096e4c20`.
GB Recompiled is pinned at `9150f87d82fa98abcb6ea22329170463f9702eb8`.

The default aggressive scan can decode data as instructions. Generated function
counts are candidates, not a measure of recovered game logic. Differential tests
compare generated execution to the same runtime's interpreter; independent emulator
comparison and gameplay testing are still needed for a compatibility claim.

## Embedded app

The `app/` directory contains a Tauri app using React, TypeScript, and Tailwind.
It asks for the ROM, remembers it, embeds the game, and supports save states.
Run `make app-install app-dev` after generating the C core. See
[app/README.md](app/README.md) for macOS/Android builds and controls.

## CI app packages

GitHub Actions builds optimized macOS and Android packages without a ROM. Successful
`main` builds update the **Latest** rolling release with a DMG and APK. See
[release builds](releases.md) and [tracked C core](app/core/README.md).
The app has checksummed saves, previous-generation backups, and pause-menu export/import.

## Sprite study

`make sprites` captures the opening route and exports editable indexed PNGs,
assembled character references, palettes and source-location candidates. Start with
[the sprite workflow](assets/README.md) and [observations](assets/observations.md).
Sprite PNGs, palettes, reference sheets and their manifest are tracked in
`assets/extracted/`. Only raw capture intermediates remain ignored.

## Reading the game code

Start with [the code guide](research/README.md) and the verified
[actor tile-upload path](research/graphics.md). The named generated entry points
keep original timing; the readable C reference explains the same data flow.

### Display and starting lives

Open the pause menu with Escape (or the phone menu button). Display offers
Original pixels, Smooth, LCD grid and CRT scanlines; effects run in the frontend
and the selection is remembered. Devices without WebGL retain the original
Canvas renderer. Lives offers Game default (difficulty-dependent) or 1–9. Choosing
a number changes the current game once and sets starting lives for new games.
Reopening or restoring a save keeps its saved lives; Game default affects only new games.

### Level select

Choose a main level from **Level select** on the main screen, then **Start selected
level**. The 16 entries each start at the first area; rooms and later areas progress
normally. The car, snow, and puzzle stages have their own entries. Your ROM is still required. Chapter
introductions are skipped; dialogue inside levels remains. Starts use your lives
setting and a fresh game state.

During play, open the pause menu and choose **Main menu / level select** to return.
Current progress is saved first; **Continue last game** resumes it. A selected
level becomes the active run for subsequent autosaves. Manual saves remain separate.
See [level-loading research](research/level-select.md).
