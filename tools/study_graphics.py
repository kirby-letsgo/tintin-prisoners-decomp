#!/usr/bin/env python3
"""Trace and verify the opening actor tile-upload path; no game logic is patched."""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import subprocess
from project import ROOT, ROM_SHA256, rom

OUT = ROOT / 'logs/code-study'
# Exclusive end PCs. These are four unrolled copies of four 16-byte tiles.
QUARTERS = [(0x0ee0,0x0fed),(0x0fed,0x10fa),(0x10fa,0x1207),(0x1207,0x1314)]
FINAL_READS = {0x0fe6,0x10f3,0x1200,0x130d}  # LD A,(HL), unlike LD A,(HL+).


def analyze():
    data = rom().read_bytes()
    sources, quarters, dma, lcdc = Counter(), Counter(), Counter(), Counter()
    batches = {}
    examples = []
    for line in (OUT/'ppu.log').open():
        d = dict(re.findall(r'(\w+)=([^\s]+)',line))
        if line.startswith('[VRAM-WRITE]') and int(d['addr'],16)<0x9800:
            pc, addr = int(d['pc'],16), int(d['addr'],16)
            quarter = next((i for i,(lo,hi) in enumerate(QUARTERS) if lo<=pc<hi),None)
            if quarter is None:
                raise ValueError(f'Unexpected tile writer: {line}')
            if not all(key in d for key in ('hl','source_bank','vbk')):
                raise ValueError('Trace needs the extended register fields; run capture again')
            source = (int(d['hl'],16)-(0 if pc in FINAL_READS else 1)) & 65535
            bank = int(d['source_bank'])
            offset = source if source<0x4000 else bank*0x4000+source-0x4000
            assert source<0x8000 and d['accepted']=='1' and d['vbk']=='1', line
            assert data[offset]==int(d['val'],16), f'ROM byte mismatch: {line}'
            sources[bank]+=1; quarters[quarter]+=1
            key=(int(d['frame']),quarter)
            batches.setdefault(key,[]).append((addr,offset))
            if len(examples)<8 or (bank==8 and not any(e['source_bank']==8 for e in examples)):
                examples.append(dict(frame=int(d['frame']),pc=f'{pc:04X}',quarter=quarter,
                                     destination=f'{addr:04X}',source_bank=bank,
                                     source_address=f'{source:04X}',rom_offset=f'{offset:06X}'))
        elif line.startswith('[DMA-START]'):
            dma[(d['pc'],d['src'])]+=1
        elif line.startswith('[PPU-WRITE]') and d['addr']=='FF40':
            lcdc[(d['pc'],d['ly'],d['old'],d['new'])]+=1
    assert batches, 'No tile-upload evidence found'
    for (frame,quarter), writes in batches.items():
        assert len(writes)==64, (frame,quarter,len(writes))
        base=writes[0][0]
        assert base in (0x8010+quarter*64,0x8110+quarter*64)
        assert [a for a,_ in writes]==list(range(base,base+64))
        for tile in range(4):
            offsets=[offset for _,offset in writes[tile*16:tile*16+16]]
            assert offsets==list(range(offsets[0],offsets[0]+16))
    summary=dict(rom_sha256=ROM_SHA256, frames='2480-2560',
                 verified_tile_bytes=sum(sources.values()), verified_64_byte_batches=len(batches),
                 source_bank_bytes=dict(sorted(sources.items())),quarter_bytes=dict(sorted(quarters.items())),
                 dma=[dict(pc=p,source=s,count=n) for (p,s),n in sorted(dma.items())],
                 lcdc=[dict(pc=p,line=int(l),old=o,new=v,count=n) for (p,l,o,v),n in sorted(lcdc.items())],
                 examples=examples,
                 limitations='Opening route only. Byte matches verify uploads, not the full animation state machine. Trace logging is diagnostic, not replacement logic.')
    (ROOT/'research/graphics-evidence.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(f"Verified {summary['verified_tile_bytes']} ROM-to-VRAM bytes in {len(batches)} complete batches.")


def capture():
    OUT.mkdir(parents=True,exist_ok=True)
    env=dict(os.environ,TINTIN_CAPTURE_ROM=str(rom()),TINTIN_CAPTURE_OUT=str(OUT/'captures'),
             GBRT_PPU_TRACE=str(OUT/'ppu.log'),GBRT_PPU_TRACE_FRAMES='2480-2560')
    with (OUT/'run.log').open('w') as log:
        subprocess.run(['cargo','test','--locked','--manifest-path','app/src-tauri/Cargo.toml',
                        '--features','asset-capture','capture_sprite_route','--','--ignored','--nocapture'],
                       cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
    analyze()


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['capture','analyze'])
    globals()[p.parse_args().command]()
