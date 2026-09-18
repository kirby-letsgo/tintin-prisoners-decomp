#!/usr/bin/env python3
"""Sign CI APKs with repository secrets, or an explicitly labelled test key."""
import base64
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
SDK = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
apks = list((ROOT / 'app/src-tauri/gen/android/app/build/outputs/apk').rglob('*-release-unsigned.apk'))
if len(apks) != 1:
    raise SystemExit(f'Expected one unsigned ARM64 release APK; found {len(apks)}')
with tempfile.TemporaryDirectory(prefix='tintin-sign-') as temp:
    key = Path(temp) / 'signing.jks'
    secret_names = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']
    supplied = [bool(os.environ.get(name)) for name in secret_names]
    if any(supplied) and not all(supplied):
        raise SystemExit('Android signing requires all four ANDROID_* secrets, or none for test signing')
    configured = bool(os.environ.get('ANDROID_KEYSTORE_BASE64'))
    if configured:
        for name in ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']:
            if not os.environ.get(name):
                raise SystemExit(f'Missing secret: {name}')
        key.write_bytes(base64.b64decode(os.environ['ANDROID_KEYSTORE_BASE64'], validate=True))
        key.chmod(0o600)
        label = 'release'
    else:
        # A disposable key allows immediate device testing. It is never advertised
        # as a stable distribution identity and cannot update a different run.
        os.environ.update(ANDROID_KEYSTORE_PASSWORD='android', ANDROID_KEY_PASSWORD='android', ANDROID_KEY_ALIAS='ci-test')
        subprocess.run(['keytool', '-genkeypair', '-keystore', str(key), '-storetype', 'JKS',
                        '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD', '-keypass:env', 'ANDROID_KEY_PASSWORD',
                        '-alias', 'ci-test', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '30',
                        '-dname', 'CN=Tintin CI Test'], check=True)
        label = 'test-signed'
        print('::warning::Using a disposable CI test signing key. Configure Android signing secrets for updateable builds.')
    aligned = Path(temp) / 'aligned.apk'
    subprocess.run([str(SDK / 'zipalign'), '-P', '16', '-f', '4', str(apks[0]), str(aligned)], check=True)
    output = OUT / f'Tintin-Player-Android-arm64-{label}.apk'
    subprocess.run([str(SDK / 'apksigner'), 'sign', '--ks', str(key), '--ks-key-alias', os.environ['ANDROID_KEY_ALIAS'],
                    '--ks-pass', 'env:ANDROID_KEYSTORE_PASSWORD', '--key-pass', 'env:ANDROID_KEY_PASSWORD',
                    '--out', str(output), str(aligned)], check=True)
    subprocess.run([str(SDK / 'apksigner'), 'verify', '--verbose', str(output)], check=True)
    if not configured:
        (OUT / 'SIGNING.txt').write_text(
            'Release-mode APK with a disposable CI test key. Not signed for store distribution.\n'
            'Export your save BEFORE uninstalling an older build: this APK cannot update an app signed with a different key.\n'
            'Configure the four ANDROID_* repository secrets described in docs/releases.md for stable updates.\n')
