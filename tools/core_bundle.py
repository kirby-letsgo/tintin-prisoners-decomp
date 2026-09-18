#!/usr/bin/env python3
"""Package verified generated C for ROM-free CI builds (never tintin_rom.c)."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / 'generated/tintin'
BUNDLE = ROOT / 'app/core/tintin-core.tar.xz'
MANIFEST = BUNDLE.with_name('manifest.json')
REVISION = '9150f87d82fa98abcb6ea22329170463f9702eb8'
RUNTIME = ('gbrt gbrt_data_mod gbrt_hash gbrt_host_configuration gbrt_port '
           'gbrt_presentation gbrt_semantic ppu audio audio_stats interpreter').split()


def allowed(name):
    return (name in ('tintin.c', 'tintin.h', 'tintin_internal.h', 'tintin_native.h', 'LICENSE.runtime')
            or re.fullmatch(r'tintin_(funcs|dispatch_chunk)_\d+\.c', name)
            or re.fullmatch(r'runtime/include/[a-z_]+\.h', name)
            or name in [f'runtime/src/{s}.c' for s in RUNTIME])


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pack():
    paths = [p for p in GEN.rglob('*') if p.is_file() and allowed(p.relative_to(GEN).as_posix())]
    files = {p.relative_to(GEN).as_posix(): p.read_bytes() for p in paths}
    files['LICENSE.runtime'] = (ROOT / '.tools/gb-recompiled/LICENSE').read_bytes()
    assert 'tintin.c' in files and any(n.startswith('tintin_funcs_') for n in files)
    with tarfile.open(BUNDLE, 'w:xz', format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(files.items()):
            entry = tarfile.TarInfo(name)
            entry.size, entry.mode = len(data), 0o644
            archive.addfile(entry, io.BytesIO(data))
    manifest = {'upstream_revision': REVISION, 'archive_sha256': digest(BUNDLE.read_bytes()),
                'files': {name: digest(data) for name, data in sorted(files.items())}}
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Packed {len(files)} source files: {BUNDLE.stat().st_size:,} bytes; no ROM image.')


def verify():
    manifest = json.loads(MANIFEST.read_text())
    assert manifest['upstream_revision'] == REVISION, 'Unexpected runtime revision'
    assert digest(BUNDLE.read_bytes()) == manifest['archive_sha256'], 'Archive checksum mismatch'
    files = {}
    with tarfile.open(BUNDLE, 'r:xz') as archive:
        for entry in archive:
            assert entry.isfile() and allowed(entry.name), f'Forbidden archive member: {entry.name}'
            assert entry.name not in files and entry.size <= 32 * 1024 * 1024
            data = archive.extractfile(entry).read()
            assert digest(data) == manifest['files'][entry.name], f'Checksum mismatch: {entry.name}'
            files[entry.name] = data
    assert set(files) == set(manifest['files']), 'Missing sources'
    print(f'Verified {len(files)} source files.')
    return files


def unpack():
    # Validate everything before writing, and reject symlink destinations.
    files = verify()
    for name in files:
        target = GEN / name
        assert all(not p.is_symlink() for p in [target, *target.parents]), 'Symlink destination'
    for name, data in files.items():
        target = GEN / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    print('Prepared generated/tintin for app builds.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['pack', 'verify', 'unpack'])
    globals()[parser.parse_args().command]()
