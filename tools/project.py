#!/usr/bin/env python3
"""Reproduce the local Tintin recompilation without checking in ROM-derived files."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REVISION = '9150f87d82fa98abcb6ea22329170463f9702eb8'
ROM_SHA256 = '4c859ad08f74bcc004f01a69a7d380cdcdea79eb731a09f935337921096e4c20'
UPSTREAM = ROOT / '.tools/gb-recompiled'
TOOL_BUILD = UPSTREAM / 'build-local'
GEN = ROOT / 'generated/tintin'
BUILD = ROOT / 'build/tintin'
LOGS = ROOT / 'logs'

def run(args, log=None, timeout=None):
    args = [str(x) for x in args]
    print('+', ' '.join(args), flush=True)
    if log:
        LOGS.mkdir(exist_ok=True)
        with (LOGS / log).open('w') as out:
            subprocess.run(args, cwd=ROOT, stdout=out, stderr=subprocess.STDOUT,
                           check=True, timeout=timeout)
    else:
        subprocess.run(args, cwd=ROOT, check=True, timeout=timeout)

def rom():
    candidates = sorted(p for p in (ROOT / 'rom').glob('*')
                        if p.suffix.lower() in ('.gb', '.gbc'))
    for p in candidates:
        if hashlib.sha256(p.read_bytes()).hexdigest() == ROM_SHA256:
            return p
    raise RuntimeError('Expected Tintin Europe En/Fr/De ROM not found in rom/; SHA-256: ' + ROM_SHA256)

def check_tool():
    if not UPSTREAM.exists():
        raise RuntimeError('Run bootstrap first.')
    actual = subprocess.check_output(['git', '-C', str(UPSTREAM), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != REVISION:
        raise RuntimeError('Tool revision differs from pinned revision: ' + actual)
    dirty = subprocess.check_output(['git', '-C', str(UPSTREAM), 'diff', 'HEAD', '--'], text=True)
    if dirty:
        raise RuntimeError('Tracked upstream files have local changes; review before regenerating.')

def bootstrap():
    if not UPSTREAM.exists():
        UPSTREAM.parent.mkdir(exist_ok=True)
        run(['git', 'clone', 'https://github.com/arcanite24/gb-recompiled.git', UPSTREAM])
        run(['git', '-C', UPSTREAM, 'checkout', '--detach', REVISION])
    check_tool()
    run(['cmake', '-G', 'Ninja', '-S', UPSTREAM, '-B', TOOL_BUILD,
         '-DBUILD_TESTS=ON', '-DCMAKE_BUILD_TYPE=Release'], 'tool-configure.log')
    run(['cmake', '--build', TOOL_BUILD, '-j', '8'], 'tool-build.log')

def generate():
    check_tool()
    source = rom()
    run([TOOL_BUILD / 'bin/gbrecomp', source, '-o', GEN, '--output-prefix', 'tintin'], 'generate.log')
    metadata = json.loads((GEN / 'tintin_metadata.json').read_text())
    if metadata['rom']['sha256'] != ROM_SHA256:
        raise RuntimeError('Generated ROM identity mismatch')
    manifest = {'rom_sha256': ROM_SHA256, 'upstream_revision': REVISION,
                'generation_options': ['--output-prefix', 'tintin'],
                'analysis_mode': 'default aggressive scan; candidates require validation'}
    (LOGS / 'generation.json').write_text(json.dumps(manifest, indent=2) + '\n')

def build():
    run(['cmake', '-G', 'Ninja', '-S', GEN, '-B', BUILD, '-DCMAKE_BUILD_TYPE=Release'], 'configure.log')
    run(['cmake', '--build', BUILD, '-j', '8'], 'build.log')

def smoke():
    saves = LOGS / 'saves'
    saves.mkdir(parents=True, exist_ok=True)
    run([BUILD / 'tintin', '--headless', '--limit-frames', '1200',
         '--save-dir', saves, '--dump-frames', '120,600,1200',
         '--screenshot-prefix', LOGS / 'boot', '--dump-state', LOGS / 'boot-state.json',
         '--report-interpreter-hotspots', '--interpreter-hotspot-limit', '12'],
        'smoke.log', timeout=180)

def route():
    saves = LOGS / 'saves'
    saves.mkdir(parents=True, exist_ok=True)
    run([BUILD / 'tintin', '--headless', '--limit-frames', '3000',
         '--save-dir', saves, '--input', '1250:A:10,1600:S:10,2000:A:10,2400:S:10',
         '--dump-frames', '1500,1900,2300,3000', '--screenshot-prefix', LOGS / 'route',
         '--dump-state', LOGS / 'route-state.json', '--report-interpreter-hotspots'],
        'route.log', timeout=180)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['verify-rom', 'bootstrap', 'generate', 'build',
                        'smoke', 'route', 'test-tool', 'differential', 'run', 'all'])
    command = parser.parse_args().command
    if command == 'verify-rom':
        print(rom())
        print('SHA-256:', ROM_SHA256)
    elif command == 'bootstrap': bootstrap()
    elif command == 'generate': generate()
    elif command == 'build': build()
    elif command == 'smoke': smoke()
    elif command == 'route': route()
    elif command == 'test-tool':
        run(['ctest', '--test-dir', TOOL_BUILD, '--output-on-failure', '-j', '4'], 'upstream-tests.log')
    elif command == 'differential':
        run([BUILD / 'tintin', '--headless', '--differential', '500000',
             '--differential-log', '100000'], 'differential.log', timeout=180)
    elif command == 'run':
        saves = LOGS / 'saves'
        saves.mkdir(parents=True, exist_ok=True)
        run([BUILD / 'tintin', '--save-dir', saves])
    elif command == 'all':
        rom()
        bootstrap()
        generate()
        build()
        smoke()

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print('Error:', error, file=sys.stderr)
        print('See logs/ for command output.', file=sys.stderr)
        sys.exit(1)
