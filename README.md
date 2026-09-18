# Tintin: Prisoners of the Sun — C recompilation

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
- `generated/tintin/`: C, embedded ROM data, runtime snapshot, and address metadata (ignored).
- `build/tintin/tintin`: native executable (ignored).
- `logs/`: build logs, captures, state dumps, and local saves (ignored).
- `docs/`: findings and validation notes.

The ROM is 1 MiB, 64 banks, CGB-only, MBC5 without cartridge RAM, revision 0.
Its SHA-256 is `4c859ad08f74bcc004f01a69a7d380cdcdea79eb731a09f935337921096e4c20`.
GB Recompiled is pinned at `9150f87d82fa98abcb6ea22329170463f9702eb8`.

The default aggressive scan can decode data as instructions. Generated function
counts are candidates, not a measure of recovered game logic. Differential tests
compare generated execution to the same runtime's interpreter; independent emulator
comparison and gameplay testing are still needed for a compatibility claim.

Initial validation and limitations are recorded in [docs/baseline.md](docs/baseline.md).

## Embedded app

The `app/` directory contains a Tauri app using React, TypeScript, and Tailwind.
It asks for the ROM, remembers it, embeds the game, and supports save states.
Run `make app-install app-dev` after generating the C core. See
[app/README.md](app/README.md) for macOS/Android builds and controls.
