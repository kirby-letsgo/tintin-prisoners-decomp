> Archived experiment: replacement packs are no longer supported by the player.
> The files and tools here are retained as graphics research.

# Edit Tintin's 2× sprites

`tintin-2x.png` is the editable spritesheet. It contains ten captured standing and
walking pose variants, arranged left-to-right in two rows. The starter sheet is a
nearest-neighbor enlargement of the originals, ready for you to redraw; it does
not contain newly drawn HD artwork.

1. Edit the PNG at its existing **400×192** size. Use an RGBA pixel-art editor,
   keep the transparent background, and turn off alpha antialiasing.
2. Keep the poses in their existing cells. Each frame occupies an 80×96 cell;
   its active sprite tiles are mapped by `tintin-2x.json`. You can change colors,
   remove pixels, and add fine detail within those mapped tile rectangles.
3. Build a portable pack:

   ```sh
   python3 tools/sprite_pack.py build assets/replacements/tintin-2x.json assets/replacements/tintin-2x.tintinsprites
   ```

4. In the game's pause menu, choose **Load 2× sprite pack** and select that file.
   The app remembers the pack privately, including on Android. **Use original
   sprites** removes it. Game saves remain independent of the artwork.

The pack contains one embedded PNG and its mappings; there are no individual
image files to manage. It requires the user's original ROM to play.

## Shared tiles and coverage

Several poses reuse the same original tile. Edit just one copy: unchanged copies
will automatically use that edit. If two copies have different edits, the builder
reports their mapping labels instead of silently choosing one. Palette variants
are separate keys; they can be edited separately.

This first sheet covers the observed opening-scene Tintin poses, not every action
or character in the game. Any unmatched tile or palette uses the original
artwork, including unrepresented fade palettes. Replacements cannot extend
outside the original sprite rectangles or change collision boxes. Partial alpha
is rejected; each pixel must be fully opaque or fully transparent. Additional
colors within opaque pixels are allowed.

The runtime uses the original sprite ordering, flips, background/window priority,
scanline sprite selection and raster enable/disable behavior. Backgrounds and the
HUD remain at their original resolution, enlarged to the 320×288 output surface.
Display shaders work on the resulting frame.

## Recreate the starter (overwrites edits)

Only run this in a new output directory if you have already edited the PNG:

```sh
python3 tools/sprite_pack.py template --captures logs/code-study/captures --out logs/fresh-sprite-template
```

The captures come from `python3 tools/study_animation.py capture`. The template
uses the previously identified groups 40, 42 and 44–51, without assuming a full
animation-state map. Each tile key combines its actual 2bpp bytes and palette;
changing VRAM slot numbers does not break the mapping.
