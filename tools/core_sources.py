#!/usr/bin/env python3
"""Record/verify the tracked source tree. Never unpack over local source edits."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / 'generated/tintin'
MANIFEST = ROOT / 'app/core/manifest.json'
REVISION = '9150f87d82fa98abcb6ea22329170463f9702eb8'
EXCLUDED = {'tintin_rom.c', 'tintin_metadata.json'}


def sources():
    files = {}
    for path in sorted(GEN.rglob('*')):
        name = path.relative_to(GEN)
        if not path.is_file() or path.name in EXCLUDED or 'build' in name.parts:
            continue
        if path.is_symlink():
            raise ValueError(f'Source tree contains a symlink: {name}')
        files[name.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    for required in ('tintin.c', 'tintin.h', 'tintin_funcs_0.c', 'runtime/src/gbrt.c', 'LICENSE.runtime'):
        if required not in files:
            raise ValueError(f'Missing tracked source: {required}')
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['record', 'verify'])
    args = parser.parse_args()
    actual = sources()
    if args.command == 'record':
        MANIFEST.write_text(json.dumps({'upstream_revision': REVISION, 'files': actual}, indent=2)+'\n')
        print(f'Recorded {len(actual)} source checksums. Review and commit the manifest with source edits.')
    else:
        expected = json.loads(MANIFEST.read_text())
        if expected['upstream_revision'] != REVISION:
            raise SystemExit('Unexpected upstream revision in source manifest')
        changed = [name for name in sorted(actual.keys() | expected['files'].keys())
                   if actual.get(name) != expected['files'].get(name)]
        if changed:
            raise SystemExit('Source changes need review and a manifest update (tools/core_sources.py record):\n'+'\n'.join(changed))
        print(f'Verified {len(actual)} tracked source files. No files were overwritten.')


if __name__ == '__main__':
    main()
