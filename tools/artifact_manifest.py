#!/usr/bin/env python3
"""Attach size and SHA-256 records to CI artifacts."""
import hashlib
import json
import os
from pathlib import Path
import sys

folder = Path(sys.argv[1])
files = sorted(p for p in folder.iterdir() if p.suffix in ('.apk', '.zip', '.dmg'))
assert files, 'No release packages found'
manifest = {'commit': os.environ.get('GITHUB_SHA'), 'files': [
    {'name': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
for item in manifest['files']:
    print(f"{item['name']}: {item['bytes'] / 1024 / 1024:.2f} MiB; SHA-256 {item['sha256']}")
