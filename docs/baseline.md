# Initial C baseline — 2026-09-18

All project changes and artifacts live in this repository. No ROM, generated C,
embedded ROM data, native binary, or screenshots have been staged or committed.

## Observed results

- Built pinned GB Recompiled and the generated Tintin C executable with Apple Clang,
  CMake/Ninja, SDL2, and the Release profile.
- Header and global ROM checksums passed; exact SHA-256 is enforced by the build helper.
- A 1,200-frame headless boot reached language selection (visually checked capture).
- A 3,000-frame scripted input route advanced through English selection and the intro
  into a playable scene showing Tintin, an NPC, a HUD, and a dialogue panel. This
  demonstrates startup/menu progression; collision, combat, audio, later levels, and
  complete gameplay have not been validated.
- Differential execution matched for 500,000 steps / 18 frames. This covers early
  startup only and compares against the same runtime's interpreter, not independent
  hardware behavior.
- Upstream CTest: 84/85 passed. `accuracy_runner_exit_policy` failed two assertions
  because its catalogue filters require external Blargg/Mooneye ROM files absent
  from a fresh checkout. The upstream source was not patched to hide this failure.

## Reproduce

```sh
make smoke
make route
make differential
make test-tool
```

The scripted route is `1250:A:10,1600:S:10,2000:A:10,2400:S:10` (frame-anchored).
Captures are in `logs/boot_*.ppm` and `logs/route_*.ppm`; machine states, command
logs, and tool/ROM provenance are alongside them. PNG previews of selected frames
are also present. `make run` starts the interactive native window.

## Remaining work

The default aggressive scan reports undefined instructions and can mistake data
for code. Generated function candidates are not recovered semantic game functions.
The boot test used 327 fallback entries / 47,271 interpreted instructions, including
bank 2 address $5F4F. The longer route exercises further fallback sites. These
counts are observations of these routes, not whole-game coverage measurements.

Next, capture executed entry points during representative play and use the trace
and validated annotations to improve analysis. Then identify input, player update,
level data, and rendering routines, and move reviewed behavior into native C
replacements. Preserve exact-ROM checks and repeatable runtime evidence throughout.
Do not hand-edit regenerable source as the durable reverse-engineering record.
