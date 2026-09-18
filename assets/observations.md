# Opening-scene graphics observations

First capture: exact Europe En/Fr/De ROM, pinned core, route to frame 4200.
501 snapshots produced 92 distinct indexed tile patterns, 411 colored/faded
variants and 52 candidate assemblies. These counts describe this route only.

Visual comparison against the full framebuffer identifies:

- `group-0040` / `group-0042`: Tintin standing, after the fade-in.
- `group-0044` through `group-0051`: observed Tintin walking poses.
- `group-0041` / `group-0043`: the black-clothed nearby character.
- `group-0000` through `group-0019`: sun animation/fade variants.

IDs refer to this capture and its manifest, not permanent engine asset numbers.
Tintin combines several palettes. Grouping only by palette split his head, shirt
and trousers; the current spatial grouping uses a common tile grid and VRAM bank.
In the frame-3000 snapshot, Tintin occupies VRAM bank 1 and OAM slots within 0–14;
the other character uses bank 0 and slots 15–24. Those are observations at this
scene, not universal ownership rules.

At that capture boundary LCDC is `0xC9` (object-enable bit clear) despite the
framebuffer showing characters and OAM containing their pieces. This demonstrates
that the final LCDC value alone cannot determine visibility over the whole frame.
The catalogue therefore records loaded OAM and the boundary enable bit separately.
Tracing writes to `$FF40` is the next step to confirm the exact raster schedule.

211 colored variants have exact raw-byte ROM matches. These include repeated
palettes over the same tile data, so this is not 211 independent source locations.
For example `obj-0200` matches file offset `0x1EEB0` (bank 7, CPU address `$6EB0`).
A byte match is a candidate location, not evidence of the upload routine or an
animation pointer. Objects without raw matches need decompression/upload tracing.

Suggested code-reading order:

1. Trace ROM reads and writes to VRAM `$8000–$97FF` when Tintin changes pose.
2. Locate the source pointer table and any decoding routine producing those bytes.
3. Trace writes to the shadow OAM buffer and DMA register `$FF46` to recover the
   actor's relative tile placement, palette choices and flips.
4. Name verified routines/data in durable project notes or generator annotations.
5. Add explicit replacement mappings guarded by original hashes, then replay the
   same route and compare unaffected tiles and game behavior.

No runtime replacement or ROM patch has been installed by this extraction pass.
