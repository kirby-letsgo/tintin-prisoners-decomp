#!/usr/bin/env python3
"""Create an editable 2x pose sheet, then bundle it for the player."""
import argparse
import base64
import io
import json
import re
import struct
from pathlib import Path
from PIL import Image
from sprites import snapshot, objects, decode_2bpp, colors
from project import ROOT, ROM_SHA256

FORMAT = 'tintin-sprites-v1'
MAX_ENTRIES = 1024


def tile_image(key):
    if len(key) != 24:
        raise ValueError('Tile keys must contain 16 pattern and 8 palette bytes')
    palette = colors(key[16:])
    image = Image.new('RGBA', (8, 8))
    image.putdata([(*palette[p], 255) if p else (0,0,0,0) for p in decode_2bpp(key[:16])])
    return image.resize((16,16), Image.Resampling.NEAREST)


def tile_pixels(sheet, entry):
    x,y = entry['x'], entry['y']
    if type(x) is not int or type(y) is not int or x < 0 or y < 0 or x+16 > sheet.width or y+16 > sheet.height:
        raise ValueError('Tile rectangle is outside the spritesheet')
    tile = sheet.crop((x,y,x+16,y+16)).convert('RGBA')
    if entry.get('flipX', False): tile = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if entry.get('flipY', False): tile = tile.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    data = bytearray(tile.tobytes())
    for i in range(0,len(data),4):
        if data[i+3] not in (0,255):
            raise ValueError('Use fully opaque or fully transparent pixels; disable alpha antialiasing')
        if not data[i+3]: data[i:i+3] = b'\0\0\0'
    return bytes(data)


def compile_entries(sheet, entries):
    if not entries or len(entries) > MAX_ENTRIES:
        raise ValueError('Pack needs 1–1024 tile mappings')
    chosen = {}
    for entry in entries:
        if not isinstance(entry.get('key'),str) or not re.fullmatch(r'[0-9a-fA-F]{48}',entry['key']):
            raise ValueError('Tile keys must be 48 hexadecimal characters')
        if any(type(entry.get(flag,False)) is not bool for flag in ('flipX','flipY')):
            raise ValueError('Flip flags must be booleans')
        key = bytes.fromhex(entry['key'])
        original = tile_image(key).tobytes()
        pixels = tile_pixels(sheet,entry)
        changed = pixels != original
        previous = chosen.get(key)
        if previous:
            old_pixels, old_entry, old_changed = previous
            if old_changed and changed and old_pixels != pixels:
                raise ValueError(f"Conflicting edits to a shared tile: {old_entry.get('label')} and {entry.get('label')}")
            if old_changed or not changed: continue
        chosen[key] = (pixels,entry,changed)
    ordered = sorted(chosen.items())
    native = b'TTSPK001' + struct.pack('<I',len(ordered))
    native += b''.join(key + value[0] for key,value in ordered)
    return native, [value[1] for key,value in ordered]


def template(captures, destination):
    manifest = json.loads((ROOT/'assets/extracted/manifest.json').read_text())
    groups = [g for g in manifest['assemblies'] if g['id'] in {'group-0040','group-0042',*(f'group-{i:04}' for i in range(44,52))}]
    sheet = Image.new('RGBA',(400,192))
    entries, frames = [], []
    for index, group in enumerate(groups):
        s = snapshot(captures/f"frame-{group['frame']:05}.bin")
        items = {item['oam']:item for item in objects(s)}
        ox,oy = (index%5)*80, (index//5)*96
        frames.append(dict(label=group['id'],x=ox,y=oy,width=64,height=80,sourceFrame=group['frame']))
        for part in group['objects']:
            obj = items[part['oam']]
            if obj['image'].height != 8:
                raise ValueError('This template expects the verified 8x8 opening-scene objects')
            key = obj['raw'] + obj['pal']
            tile = obj['placed'].convert('RGBA').resize((16,16),Image.Resampling.NEAREST)
            x,y = ox + part['x']*2, oy + part['y']*2
            sheet.paste(tile,(x,y))
            entries.append(dict(key=key.hex(),x=x,y=y,flipX=bool(obj['flags']&32),flipY=bool(obj['flags']&64),label=f"{group['id']}/oam-{obj['oam']}"))
    destination.mkdir(parents=True,exist_ok=True)
    sheet.putdata([p if p[3] else (0,0,0,0) for p in sheet.get_flattened_data()])
    sheet.save(destination/'tintin-2x.png')
    spec = dict(format=FORMAT,romSha256=ROM_SHA256,scale=2,sheet='tintin-2x.png',frames=frames,entries=entries)
    (destination/'tintin-2x.json').write_text(json.dumps(spec,indent=2)+'\n')
    print(f'Created {len(frames)} pose cells and {len(entries)} tile mappings in {destination}')


def build(spec_path, output, native_path=None):
    spec = json.loads(spec_path.read_text())
    if spec['format'] != FORMAT or spec['romSha256'] != ROM_SHA256 or spec['scale'] != 2:
        raise ValueError('Unsupported sprite pack format or ROM')
    with Image.open(spec_path.parent/spec['sheet']) as source:
        if source.width > 2048 or source.height > 2048:
            raise ValueError('Sheet must be at most 2048x2048')
        sheet = source.convert('RGBA')
    native, entries = compile_entries(sheet,spec['entries'])
    encoded = io.BytesIO();sheet.save(encoded,format='PNG')
    if len(encoded.getvalue()) > 4*1024*1024: raise ValueError('Sheet PNG is too large')
    pack = dict(format=FORMAT,romSha256=ROM_SHA256,scale=2,png=base64.b64encode(encoded.getvalue()).decode(),entries=entries)
    output.write_text(json.dumps(pack,separators=(',',':'))+'\n')
    if native_path: native_path.write_bytes(native)
    print(f'Built {output}: {len(entries)} unique replacement tiles. Shared unchanged copies follow edited tiles.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command',required=True)
    p = sub.add_parser('template');p.add_argument('--captures',type=Path,default=ROOT/'logs/code-study/captures');p.add_argument('--out',type=Path,default=ROOT/'assets/replacements')
    p = sub.add_parser('build');p.add_argument('mapping',type=Path);p.add_argument('output',type=Path);p.add_argument('--native',type=Path)
    args = parser.parse_args()
    if args.command == 'template': template(args.captures,args.out)
    else: build(args.mapping,args.output,args.native)
