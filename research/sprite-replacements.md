# 2× sprite presentation

The authoring workflow is in `assets/replacements/README.md`. The initial atlas
contains ten observed Tintin pose variants and 81 unique tile/palette keys. It is
original artwork enlarged to 2×; the feature enables replacement art, not automatic
redrawing.

## Where the replacement happens

`native/sprites.c` is a host-only compositor. Optional `TT_SPRITE_PACK` calls in
`runtime/src/ppu.c` provide each pixel's live background color and priority before
objects are flattened into the original framebuffer. The compositor reads the
same ten-per-line object selection as the PPU, then independently resolves each
of the four high-resolution subpixels. Transparent replacement pixels can expose
the background or a lower-priority object; opaque replacement pixels can fill an
originally transparent pixel within that object's existing rectangle.

Both CGB object order and OPRI's X-position order are preserved. Object selection
precedes background priority, so a winning object hidden by the background cannot
incorrectly expose a lower-priority object. Horizontal/vertical flips include
subpixel order and 8×16 tile-pair selection. Unmatched graphics use the live game
palette and original tile pattern. Palette changes invalidate matches immediately;
this first format does not attempt to infer custom-art fade colors.

The identity pack is intended to equal nearest-neighbor scaling of the original
frame. Guest VRAM/OAM, CPU cycles, gameplay and the original 160×144 framebuffer
are never modified. No field is added to `GBContext` or `GBPPU`, so the save-state
layout remains unchanged. Import/reset/restore/LCD power changes invalidate the
host buffer; partial frames fall back to the original until a complete frame is
available. Completed HD frames are double-buffered.

## Formats

The portable `.tintinsprites` JSON embeds one base64 PNG, ROM SHA256, format
`tintin-sprites-v1`, scale 2, and mappings from 24-byte keys to 16×16 atlas rectangles.
Keys are 16 original tile bytes followed by 8 RGB555 object-palette bytes.
The frontend checks file size, PNG dimensions, ROM identity, key uniqueness,
rectangles and binary alpha before producing the bounded native format.
No URLs or external paths in a pack are followed.

The native format is magic `TTSPK001`, a little-endian uint32 count, then sorted
records: 24-byte key and 1,024 RGBA bytes. Maximum 1,024 records. Native parsing
rechecks exact length, sorted unique keys, and alpha before replacing the active
pack. Invalid imports preserve the previous pack. The app stores validated native
data in its private directory, independently of save exports.

The original tick packet stays unchanged. When a pack is enabled, the app appends
320×288 RGBA bytes after the original audio payload; the frontend accepts exactly
either packet size. That preserves existing native callers and provides the
original frame for comparison. This first version trades extra transfer bandwidth
for a simple compatible protocol; Android device performance still needs hands-on
verification. With no pack loaded, no HD suffix is sent.

## Verification

ROM-free Python tests cover packing, shared edits, conflicts, flips and rejection.
`tools/test_sprite_compositor.c` checks subpixel sampling, transparency, 8×16 flips,
object/BG priority, palette and VRAM cache invalidation, and incomplete frames under
AddressSanitizer and UndefinedBehaviorSanitizer. These run in GitHub CI.

The ignored `sprite_pack_route` Rust test uses the local ROM and the compiled
starter pack. It compares 501 original graphics snapshots and HD identity frames
through the deterministic opening route, then loads a deliberately striped pack,
restores a save, and checks that adjacent HD subpixels differ. This fixture is a
test signal, not replacement artwork to ship.

```sh
python3 tools/sprite_pack.py build assets/replacements/tintin-2x.json assets/replacements/tintin-2x.tintinsprites --native logs/tintin-original.ttspk
cargo test --locked --manifest-path app/src-tauri/Cargo.toml --features asset-capture sprite_pack_route -- --ignored --nocapture
```

Reapply `sprite-presentation.patch` after core regeneration. The hooks compile out
of standalone upstream builds; the Tauri build supplies `TT_SPRITE_PACK` and the
native compositor.
