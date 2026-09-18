#!/usr/bin/env python3
"""Capture and decode observed Tintin graphics, and encode edited indexed tiles."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
from PIL import Image, ImageDraw
from project import ROOT, ROM_SHA256, rom

OUT = ROOT / 'assets/extracted'
SIZE = 32 + 16384 + 160 + 128 + 160 * 144 * 4
GRAY = [(255,255,255), (170,170,170), (85,85,85), (0,0,0)]


def decode_2bpp(data):
    if len(data) not in (16, 32):
        raise ValueError('Expected one 8x8 tile or one 8x16 tile pair')
    return [((data[y*2] >> (7-x)) & 1) | (((data[y*2+1] >> (7-x)) & 1) << 1)
            for y in range(len(data)//2) for x in range(8)]


def encode_2bpp(image):
    if image.mode != 'P' or image.size not in ((8,8), (8,16)):
        raise ValueError('Keep the exported PNG indexed (P), 8x8 or 8x16, with palette indices 0–3')
    pixels = list(image.get_flattened_data())
    if any(p > 3 for p in pixels):
        raise ValueError('Only palette indices 0–3 are supported; 0 is transparent')
    data = bytearray()
    for y in range(image.height):
        row = pixels[y*8:y*8+8]
        data.extend([sum((p & 1) << (7-x) for x,p in enumerate(row)),
                     sum(((p >> 1) & 1) << (7-x) for x,p in enumerate(row))])
    return bytes(data)


def colors(data):
    # Expand hardware RGB555 to sRGB channel integers without a display filter.
    return [tuple(((value >> shift) & 31) * 255 // 31 for shift in (0,5,10))
            for (value,) in struct.iter_unpack('<H', data)]


def indexed(pixels, size, palette, transparent=True):
    im = Image.new('P', size)
    im.putdata(pixels)
    im.putpalette([c for rgb in palette for c in rgb] + [0]*(768-len(palette)*3))
    if transparent:
        im.info['transparency'] = 0
    return im


def snapshot(path):
    data = path.read_bytes()
    if len(data) != SIZE or data[:8] != b'TTVRAM01':
        raise ValueError(f'Invalid capture: {path}')
    return dict(frame=struct.unpack_from('<I', data, 8)[0], lcdc=data[12],
                vram=data[32:16416], oam=data[16416:16576],
                obj=data[16576:16640], bg=data[16640:16704], rgba=data[16704:])


def objects(s):
    # Keep loaded OAM even when OBJ is disabled at capture: this game changes
    # LCDC mid-frame around dialogue/HUD regions. End-of-frame enable is not
    # proof that these objects were invisible throughout the frame.
    height = 16 if s['lcdc'] & 4 else 8
    result = []
    for i in range(40):
        y,x,tile,flags = s['oam'][i*4:i*4+4]
        x,y = x-8,y-16
        if not (-8 < x < 160 and -height < y < 144):
            continue
        tile = tile & 254 if height == 16 else tile
        bank, palette = (flags >> 3) & 1, flags & 7
        start = bank*8192 + tile*16
        raw = s['vram'][start:start+height*2]
        pal = s['obj'][palette*8:palette*8+8]
        image = indexed(decode_2bpp(raw), (8,height), colors(pal))
        if not image.convert('RGBA').getbbox():
            continue
        placed = image
        if flags & 32: placed = placed.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if flags & 64: placed = placed.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        result.append(dict(oam=i, x=x, y=y, tile=tile, bank=bank, palette=palette,
                           flags=flags, raw=raw, pal=pal, image=image, placed=placed))
    return result


def rom_matches(rom_data, raw):
    matches, at = [], 0
    while (at := rom_data.find(raw, at)) != -1:
        matches.append(dict(offset=at, bank=at//0x4000,
                            address=at if at < 0x4000 else 0x4000+at%0x4000))
        at += 1
    return matches


def groups(items):
    # Candidate assemblies: touching object rectangles on the same bank and tile grid.
    # These are spatial guesses, not recovered game metasprite definitions.
    pending = list(items)
    while pending:
        group = [pending.pop(0)]
        changed = True
        while changed:
            changed = False
            for b in pending[:]:
                if any(a['bank'] == b['bank'] and a['x'] % 8 == b['x'] % 8 and a['y'] % 8 == b['y'] % 8 and
                       a['x'] <= b['x']+8 and b['x'] <= a['x']+8 and
                       a['y'] <= b['y']+b['placed'].height and b['y'] <= a['y']+a['placed'].height
                       for a in group):
                    group.append(b); pending.remove(b); changed = True
        yield group


def contact(images, path, columns=12):
    if not images: return
    w = max(48, max(im.width*3+12 for _, im in images))
    h = max(72, max(im.height*3+24 for _, im in images))
    sheet = Image.new('RGB', (columns*w, ((len(images)+columns-1)//columns)*h), '#20252b')
    draw = ImageDraw.Draw(sheet)
    for n,(label,im) in enumerate(images):
        x,y = n%columns*w, n//columns*h
        large = im.convert('RGBA').resize((im.width*3, im.height*3), Image.Resampling.NEAREST)
        sheet.paste(large, (x+6,y+4), large)
        draw.text((x+4,y+h-15), label, fill='white')
    sheet.save(path)


def export():
    captures = sorted((OUT/'captures').glob('*.bin'))
    if not captures: raise ValueError('Run capture first')
    rom_data = rom().read_bytes()
    for name in ('objects','assemblies','scenes'):
        (OUT/name).mkdir(parents=True, exist_ok=True)
    old_manifest = json.loads((OUT/'manifest.json').read_text()) if (OUT/'manifest.json').exists() else {}
    sprites, assemblies, snapshots = {}, {}, []
    direct = 0
    for path in captures:
        s = snapshot(path)
        items = objects(s)
        seen = []
        for item in items:
            key = hashlib.sha256(item['raw']+item['pal']).hexdigest()
            if key not in sprites:
                label = f'obj-{len(sprites):04}'
                image_path = OUT/'objects'/f'{label}.png'
                item['image'].save(image_path)
                (OUT/'objects'/f'{label}.2bpp').write_bytes(item['raw'])
                matches = rom_matches(rom_data, item['raw'])
                direct += bool(matches)
                sprites[key] = dict(id=label, image=f'objects/{label}.png', width=8,
                                    height=item['image'].height, raw_sha256=hashlib.sha256(item['raw']).hexdigest(),
                                    palette_rgb=colors(item['pal']), rom_matches=matches, occurrences=[])
            record = sprites[key]
            occurrence = {k:item[k] for k in ('oam','x','y','tile','bank','palette','flags')}
            occurrence['frame'] = s['frame']
            record['occurrences'].append(occurrence)
            seen.append(dict(id=record['id'], **occurrence))
        for group in groups(items):
            x,y = min(i['x'] for i in group),min(i['y'] for i in group)
            w = max(i['x']+8 for i in group)-x
            h = max(i['y']+i['image'].height for i in group)-y
            if w > 64 or h > 64: continue
            canvas = Image.new('RGBA',(w,h))
            for i in sorted(group,key=lambda a:a['oam'],reverse=True):
                canvas.alpha_composite(i['placed'].convert('RGBA'), (i['x']-x,i['y']-y))
            key = hashlib.sha256(struct.pack('<HH',w,h)+canvas.tobytes()).hexdigest()
            if key not in assemblies:
                label = f'group-{len(assemblies):04}'
                canvas.save(OUT/'assemblies'/f'{label}.png')
                assemblies[key] = dict(id=label, image=f'assemblies/{label}.png',
                                       kind='spatial candidate, not a confirmed actor definition',
                                       frame=s['frame'], origin=[x,y],
                                       objects=[dict(oam=i['oam'],x=i['x']-x,y=i['y']-y,
                                                     bank=i['bank'],tile=i['tile'],flags=i['flags']) for i in group])
        snapshots.append(dict(frame=s['frame'], capture=path.name, lcdc=s['lcdc'], objects_enabled_at_capture=bool(s['lcdc'] & 2), objects=seen))
    # Selected route milestones include full screenshot, isolated OBJ layer and VRAM.
    scenes = []
    for requested in (1500,1900,2300,3000,3300,3600,4200):
        path = min(captures,key=lambda p:abs(int(p.stem.split('-')[1])-requested))
        s = snapshot(path)
        name = f'frame-{requested:05}'
        Image.frombytes('RGBA',(160,144),s['rgba']).save(OUT/'scenes'/f'{name}-screen.png')
        layer = Image.new('RGBA',(160,144))
        for item in reversed(objects(s)):
            layer.alpha_composite(item['placed'].convert('RGBA'),(item['x'],item['y']))
        layer.save(OUT/'scenes'/f'{name}-objects.png')
        for bank in range(2):
            tiles = Image.new('RGB',(16*8,24*8))
            for tile in range(384):
                start = bank*8192+tile*16
                im = indexed(decode_2bpp(s['vram'][start:start+16]),(8,8),GRAY,False)
                tiles.paste(im.convert('RGB'),(tile%16*8,tile//16*8))
            tiles.save(OUT/'scenes'/f'{name}-vram{bank}.png')
        palettes = Image.new('RGB',(4*16,16*16))
        draw = ImageDraw.Draw(palettes)
        for idx,rgb in enumerate(colors(s['obj']+s['bg'])):
            x,y=idx%4*16,idx//4*16
            draw.rectangle((x,y,x+15,y+15),fill=rgb)
        palettes.save(OUT/'scenes'/f'{name}-palettes.png')
        scenes.append(dict(name=name, frame=s['frame']))
    manifest = dict(rom_sha256=ROM_SHA256, capture_version=1,
                    coverage='Opening route to frame 4200, sampled every 6 frames; not all levels or animations',
                    raw_rom_matching='Exact byte candidates only; no match may mean compression or generated tiles. Matches are not confirmed provenance.',
                    objects=list(sprites.values()),assemblies=list(assemblies.values()),snapshots=snapshots,scenes=scenes)
    old_images = {r['image'] for r in old_manifest.get('assemblies', [])}
    new_images = {r['image'] for r in assemblies.values()}
    for name in old_images-new_images:
        if Path(name).parent == Path('assemblies') and Path(name).name.startswith('group-'):
            (OUT/name).unlink(missing_ok=True)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    contact([(r['id'],Image.open(OUT/r['image'])) for r in sprites.values()],OUT/'objects-sheet.png')
    contact([(r['id'],Image.open(OUT/r['image'])) for r in assemblies.values()],OUT/'assemblies-sheet.png',8)
    html = '''<!doctype html><meta charset="utf-8"><title>Tintin sprite study</title>
<style>body{background:#12161c;color:#eee;font:16px system-ui;margin:32px}img{image-rendering:pixelated;max-width:100%}section{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0 0 24px}figure img{width:320px;background:#303640}a{color:#9cf}</style>
<h1>Tintin · sprite study</h1><p>Opening route only. Objects are hardware tile pieces. Assemblies are spatial guesses, not confirmed character definitions.</p>
<p>Native-size indexed PNGs and original 2bpp bytes are in <code>objects/</code>. IDs, palettes, OAM placements and candidate ROM offsets are in <a href="manifest.json">manifest.json</a>.</p><h2>Scenes</h2><section>'''
    for s in scenes:
        html += f'<figure><img src="scenes/{s["name"]}-screen.png"><figcaption>Frame {s["frame"]}</figcaption></figure><figure><img src="scenes/{s["name"]}-objects.png"><figcaption>Isolated object layer</figcaption></figure>'
    html += '</section><h2>Candidate assemblies</h2><img src="assemblies-sheet.png"><h2>Hardware objects</h2><img src="objects-sheet.png">'
    (OUT/'index.html').write_text(html)
    print(f'{len(captures)} snapshots; {len(sprites)} unique colored objects; {len(assemblies)} candidate assemblies; {direct} objects with raw ROM matches.')
    print(OUT/'index.html')


def capture():
    target = OUT/'captures'
    if target.exists() and any(target.iterdir()):
        raise ValueError('Capture folder already contains a run. Move assets/extracted aside before recapturing.')
    target.mkdir(parents=True,exist_ok=True)
    env = dict(os.environ,TINTIN_CAPTURE_ROM=str(rom()),TINTIN_CAPTURE_OUT=str(target.resolve()))
    (ROOT/'logs').mkdir(exist_ok=True)
    with (ROOT/'logs/sprite-capture.log').open('w') as log:
        subprocess.run(['cargo','test','--locked','--manifest-path',str(ROOT/'app/src-tauri/Cargo.toml'),
                        '--features','asset-capture','capture_sprite_route','--','--ignored','--nocapture'],
                       env=env,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
    export()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command',required=True)
    sub.add_parser('capture'); sub.add_parser('export')
    enc = sub.add_parser('encode'); enc.add_argument('png',type=Path); enc.add_argument('output',type=Path)
    args = parser.parse_args()
    if args.command == 'encode':
        args.output.write_bytes(encode_2bpp(Image.open(args.png)))
        print('Encoded tile bytes only; no ROM or game file was modified.')
    else: globals()[args.command]()
