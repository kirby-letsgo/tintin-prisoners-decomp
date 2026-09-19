# Sprite extraction — first reverse-engineering step

The repeatable graphics study lives in `assets/extracted/`. Sprite PNGs, original
2bpp bytes, palettes, sheets and metadata are tracked in Git. Only raw snapshots
in `assets/extracted/captures/` are ignored.
It requires your exact local ROM and never modifies it or your app saves.

```sh
python3 -m pip install -r tools/requirements-assets.txt
python3 tools/core_sources.py verify
python3 tools/sprites.py capture
# Rebuild images from existing captures without running the game again:
python3 tools/sprites.py export
# Decoder/encoder tests, no ROM required:
python3 -m unittest discover -s tools -p test_sprites.py -v
```

Open `assets/extracted/index.html` in a browser. `objects-sheet.png` is the object
catalogue; `assemblies-sheet.png` combines touching pieces into candidate figures.
The opening route selects English, passes the intro, then tries right/left movement
in the first scene. It stops at frame 4200 and samples every six frames. This is
observed coverage, not an exhaustive dump of every animation, enemy, or level.
Commit your art edits before regeneration and keep an editable copy separately.
Move the raw `captures/` directory aside before capturing a new run; review the
resulting image/manifest diff before committing. A fresh checkout can view and
edit the tracked art without capturing again.

## What is exported

- `objects/*.png`: native 8×8 or 8×16 **indexed PNGs**, four palette indices,
  transparent index 0. These are hardware pieces, not necessarily whole characters.
- `objects/*.2bpp`: exact original packed pixels, for lossless comparison.
- `assemblies/*.png`: transparent RGBA spatial groupings, with OAM piece placements
  in the manifest. Groups use a shared VRAM bank and 8-pixel grid; they can merge adjacent actors or split a multi-bank actor;
  they are reference images, not confirmed game metasprite structures.
- `scenes/`: full framebuffer, isolated object layer, both VRAM tile banks, and
  palette swatches (8 object palettes followed by 8 background palettes).
- `manifest.json`: stable IDs within this capture, pixel hashes, palettes, observed
  frames, OAM indices, VRAM bank/tile IDs, positions/flags and exact ROM byte matches.
- `captures/`: portable raw snapshots of VRAM, OAM, palettes and the framebuffer.

Loaded OAM is included even if LCDC disables sprites at the capture boundary;
the opening scene changes sprite visibility within a frame.

The source matches are **candidates**, not confirmed asset pointers. A tile can
occur at multiple ROM offsets; decompression or generated graphics can yield no
raw match at all. Do not patch every matching offset automatically. RGB555 colors
are expanded directly, without a display color-correction filter. The isolated
object layer intentionally includes objects hidden behind backgrounds and does
not emulate per-scanline sprite limits or mid-frame changes. Use the full screen
capture as the reference for what the runtime actually displayed.

## Editing workflow

Copy the native indexed PNG you want to edit to a separate working folder. Keep
its dimensions, indexed mode, four indices and transparent index 0. Export the
edited indices back to Game Boy tile bytes:

```sh
python3 tools/sprites.py encode path/to/edited.png path/to/edited.2bpp
```

This command does **not** modify the game. It rejects incompatible dimensions,
RGBA conversion, and indices above 3. Palette-only changes need a separate palette
replacement; the 2bpp encoder stores pixel indices, not colors. All unchanged PNGs
can be re-encoded to exactly their original bytes.

The next implementation step is to confirm the character's assembly/animation
records and tile upload/decompression routines, then add an explicit replacement
mapping with an original-byte/hash check. For high-resolution artwork, the player now supports a separate 2× replacement
renderer. See [the spritesheet workflow](replacements/README.md); the original
2bpp extraction/encoding pipeline still preserves GBC dimensions.

## Where the code lives

`tools/sprites.py` decodes 2bpp and palettes, builds the catalogue, searches ROM
matches, and encodes edits. `tools/test_sprites.py` checks bitplanes, bank selection,
8×16 even-tile rules, whole-object flips, malformed inputs and PNG round trips.

The Rust ignored test `capture_sprite_route` drives the existing native core with
deterministic inputs. The `asset-capture` Cargo feature enables the C bridge's
`tt_graphics_snapshot`. It snapshots at the PPU frame-complete safepoint. The
normal app and CI release builds do not enable this feature, so capture buffers
and capture work are absent from shipping builds.

Hardware references: [tile data](https://gbdev.io/pandocs/Tile_Data.html),
[OAM](https://gbdev.io/pandocs/OAM.html),
[palettes](https://gbdev.io/pandocs/Palettes.html).
