#!/usr/bin/env python3
"""Validate frame lookup and descriptor staging against a local instrumented replay."""
import argparse
from collections import Counter
import json
import re
from actor_frames import RECORDS,RECORD_SIZE,decode_frame,select_frame
from project import ROOT,ROM_SHA256,rom
from study_graphics import OUT,capture


def analyze():
    data=rom().read_bytes()
    selected=None; current=None
    selectors=[]; records=[]; metadata=[]; descriptors=[]

    def finish():
        if current is None: return
        assert metadata == list(current.metadata), ('Metadata mismatch',current.index,metadata)
        assert bytes(descriptors)==current.descriptor_bytes, ('Descriptor mismatch',current.index,len(descriptors))
        records.append(current.index)

    for line in (OUT/'ppu.log').open():
        if not line.startswith('[ANIM-WRITE]'):continue
        d=dict(re.findall(r'(\w+)=([^\s]+)',line))
        pc,addr,value=int(d['pc'],16),int(d['addr'],16),int(d['val'],16)
        if pc==0x3599:
            table=int(d['hl'],16); phase_base=int(d['de'],16)
            assert (table-0x4000)%2==0 and (phase_base-0x4084)%2==0
            animation=(table-0x4000)//2; phase=(phase_base-0x4084)//2
            index,pointer=select_frame(data,animation,phase)
            selected=dict(frame=int(d['frame']),mapped_animation=animation,phase=phase,index=index,address=pointer)
        elif pc in (0x35a3,0x35a7):
            assert selected is not None, 'Missing animation lookup event'
            assert int(d['hl'],16)==selected['address']+1
            assert addr==(0xdf73 if pc==0x35a3 else 0xdf74)
            expected=(selected['index']>>(0 if pc==0x35a3 else 8)) & 255
            assert value==expected, 'Selected frame ID differs from ROM lookup'
            if pc==0x35a7: selectors.append(selected)
        elif pc==0x15ca:
            finish()
            source=int(d['hl'],16)-1
            assert (source-RECORDS)%RECORD_SIZE==0 and d['source_bank']=='9'
            current=decode_frame(data,(source-RECORDS)//RECORD_SIZE)
            assert selected and current.index==selected['index'], 'Staged frame differs from selected frame'
            metadata=[value];descriptors=[]
        elif pc in (0x15ce,0x15d2):
            assert current is not None
            metadata.append(value)
        elif pc in (0x15dc,0x15df,0x15e2):
            assert current is not None and addr==0xde42+len(descriptors) and d['wbank']=='1'
            source=int(d['hl'],16)-1
            assert source==RECORDS+current.index*RECORD_SIZE+3+len(descriptors)
            assert d['source_bank']=='9'
            descriptors.append(value)
    finish()
    assert selectors and records, 'No animation evidence captured'
    counts=Counter(records)
    result=dict(rom_sha256=ROM_SHA256,frames='2480-2560',
                verified_selections=len(selectors),verified_staged_records=len(records),
                verified_descriptor_bytes=len(records)*48,
                observed_records=[dict(index=index,loads=count,address=f'{RECORDS+index*RECORD_SIZE:04X}',
                                       metadata=list(decode_frame(data,index).metadata)) for index,count in sorted(counts.items())],
                selections=selectors,
                limitations='Mapped animation IDs and phases verified; the upstream state-to-animation mapper and full state machine are not recovered.')
    (ROOT/'research/animation-evidence.json').write_text(json.dumps(result,indent=2)+'\n')
    print(f'Verified {len(selectors)} frame selections and {len(records)} complete 51-byte record loads ({len(records)*48} staged descriptor bytes).')
    print('Observed frame IDs:', ', '.join(map(str,sorted(counts))))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['capture','analyze'])
    if parser.parse_args().command=='capture':capture()
    analyze()
