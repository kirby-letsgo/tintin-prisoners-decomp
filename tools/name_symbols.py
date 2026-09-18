#!/usr/bin/env python3
"""Reapply reviewed names/comments after regeneration, without changing instructions."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def main():
    symbols = json.loads((ROOT/'research/symbols.json').read_text())['symbols']
    files = sorted(p for p in (ROOT/'generated/tintin').glob('tintin*')
                   if p.suffix in ('.c','.h') and p.name != 'tintin_rom.c')
    replacements = {s['generated_name']:s['name'] for s in symbols}
    pattern = re.compile(r'\b('+'|'.join(map(re.escape,replacements))+r')\b')
    changed=0
    for path in files:
        original = path.read_text()
        text = pattern.sub(lambda m:replacements[m[0]],original)
        for symbol in symbols:
            address=symbol['address'].lower()
            label=f'loc_{address}:\n' if symbol['bank']==0 else f"loc_{symbol['bank']:02x}_{address}:\n"
            marker=f"/* Named: {symbol['name']} - {symbol['description']} */"
            if label in text and marker not in text:
                text=text.replace(label,label+'    '+marker+'\n')
        if text!=original:
            path.write_text(text);changed+=1
    print(f'Applied {len(symbols)} reviewed symbols; changed {changed} files.')
    print('Refresh source checksums with: python3 tools/core_sources.py record')


if __name__=='__main__':main()
