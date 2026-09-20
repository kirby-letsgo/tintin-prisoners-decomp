#!/usr/bin/env python3
"""Publish this workflow's verified DMG/APK to the mutable rolling release."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

TAG = 'rolling'


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True).strip()


def packages(folder, sha):
    """Keep per-job manifests separate and require both packages from this SHA."""
    found = []
    for platform, suffix in [('macOS', '.dmg'), ('Android', '.apk')]:
        directory = folder / f'Tintin-Player-{platform}-arm64'
        manifest = json.loads((directory / 'manifest.json').read_text())
        if manifest['commit'] != sha:
            raise ValueError(f'{platform} artifact is from a different commit')
        candidates = list(directory.glob(f'*{suffix}'))
        if len(candidates) != 1:
            raise ValueError(f'Expected exactly one {platform} {suffix}')
        path = candidates[0]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        expected = {'name': path.name, 'bytes': path.stat().st_size, 'sha256': digest}
        if expected not in manifest['files'] or not expected['bytes']:
            raise ValueError(f'Invalid size/checksum for {path.name}')
        found.append((path, digest))
    return found


def publish(folder):
    if os.environ.get('GITHUB_EVENT_NAME') != 'push' or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Rolling releases may only be published by pushes to main')
    sha = os.environ['GITHUB_SHA']
    run = os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT']
    if not re.fullmatch(r'[0-9a-f]{40}', sha) or not re.fullmatch(r'\d+-\d+', run):
        raise ValueError('Invalid workflow commit/run identity')
    repo = os.environ['GH_REPO']
    selected = packages(folder, sha)  # Validate before making any remote changes.
    api = f'repos/{repo}'
    if gh('api', f'{api}/git/ref/heads/main', '--jq', '.object.sha') != sha:
        print('Main has advanced; leaving the rolling release for its newer build.')
        return
    # Listing distinguishes "no release" from an authentication/network failure.
    existing = gh('api', f'{api}/releases', '--paginate', '--jq',
                  '.[] | select(.tag_name == "rolling") | .id')
    with tempfile.TemporaryDirectory(prefix='tintin-release-') as temp:
        temp = Path(temp)
        assets = []
        records = []
        for original, digest in selected:
            # Unique per attempt: a failed upload never overwrites the last build.
            dest = temp / f'{original.stem}-{sha[:12]}-{run}{original.suffix}'
            shutil.copyfile(original, dest)
            assets.append(dest)
            records.append({'name': dest.name, 'bytes': dest.stat().st_size, 'sha256': digest})
        manifest = temp / f'manifest-{sha[:12]}-{run}.json'
        manifest.write_text(json.dumps({'commit': sha, 'files': records}, indent=2) + '\n')
        assets.append(manifest)
        notes = temp / 'notes.md'
        lines = [f'Latest successful main build: [{sha[:12]}](https://github.com/{repo}/commit/{sha}).', '',
                 'This rolling release is replaced after successful main builds.', '',
                 *[f'- [{p.name}](https://github.com/{repo}/releases/download/{TAG}/{p.name})' for p in assets], '',
                 'macOS: Apple Silicon, ad-hoc signed, not notarized. Your own ROM is required.']
        if 'test-signed' in selected[1][0].name:
            lines += ['', 'Android: disposable test signing key. Export saves before uninstalling an older build; '
                      'configure repository signing secrets for updates that preserve app data.']
        notes.write_text('\n'.join(lines) + '\n')
        if not existing:
            gh('release', 'create', TAG, '--target', sha, '--draft', '--title', 'Latest', '--notes-file', str(notes))
        gh('release', 'upload', TAG, *map(str, assets))
        # Upload both platforms before moving the tag or advertising the new build.
        refs = json.loads(gh('api', f'{api}/git/matching-refs/tags/{TAG}'))
        if any(ref['ref'] == f'refs/tags/{TAG}' for ref in refs):
            gh('api', '--method', 'PATCH', f'{api}/git/refs/tags/{TAG}', '-f', f'sha={sha}', '-F', 'force=true')
        else:
            gh('api', '--method', 'POST', f'{api}/git/refs', '-f', f'ref=refs/tags/{TAG}', '-f', f'sha={sha}')
        gh('release', 'edit', TAG, '--title', 'Latest', '--notes-file', str(notes),
           '--draft=false', '--prerelease=false', '--latest')
        # Also removes leftovers from any interrupted older upload after success.
        current = json.loads(gh('release', 'view', TAG, '--json', 'assets'))['assets']
        keep = {p.name for p in assets}
        for asset in current:
            if asset['name'] not in keep:
                gh('release', 'delete-asset', TAG, asset['name'], '--yes')
    print(f'Updated https://github.com/{repo}/releases/tag/{TAG} to {sha}')


if __name__ == '__main__':
    publish(Path(sys.argv[1]))
