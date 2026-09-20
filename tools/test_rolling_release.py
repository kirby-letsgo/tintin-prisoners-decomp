"""Exercise release publication offline; never calls GitHub."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import rolling_release as release

SHA = 'a' * 40
ENV = {'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/heads/main',
       'GITHUB_SHA': SHA, 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1',
       'GH_REPO': 'example/game'}


class RollingReleaseTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.paths = []
        for platform, suffix in [('macOS', '.dmg'), ('Android', '.apk')]:
            directory = self.root / f'Tintin-Player-{platform}-arm64'
            directory.mkdir()
            path = directory / f'Tintin-Player-{platform}-arm64{suffix}'
            path.write_bytes(f'package: {platform}'.encode())
            self.paths.append(path)
            # Use the real producer so adding DMG support is tested end-to-end.
            subprocess.run(['python3', str(Path(__file__).with_name('artifact_manifest.py')), str(directory)],
                           env={**os.environ, 'GITHUB_SHA': SHA}, check=True, stdout=subprocess.DEVNULL)
        self.commands = []
        self.uploaded = []
        self.notes = ''
        self.existing = True
        self.tag_exists = True
        self.fail_upload = False
        self.head = SHA
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, ENV).start()
        patch.object(release, 'gh', side_effect=self.fake_gh).start()

    def fake_gh(self, *args):
        self.commands.append(args)
        if args[0] == 'api':
            if args[1].endswith('/git/ref/heads/main'):
                return self.head
            if args[1].endswith('/releases'):
                return '42' if self.existing else ''
            if args[1].endswith('/git/matching-refs/tags/rolling'):
                return json.dumps([{'ref': 'refs/tags/rolling'}] if self.tag_exists else [])
            self.assertIn(args[1], ['--method'])
            return '{}'
        if args[:2] == ('release', 'upload'):
            self.uploaded = [Path(p).name for p in args[3:]]
            manifest = json.loads(Path(args[-1]).read_text())
            self.assertEqual(manifest['commit'], SHA)
            self.assertEqual({x['name'] for x in manifest['files']}, set(self.uploaded[:2]))
            for name in self.uploaded:
                self.assertIn(SHA[:12], name)
                self.assertIn('123-1', name)
            if self.fail_upload:
                raise subprocess.CalledProcessError(1, 'gh release upload')
        elif args[:2] == ('release', 'view'):
            return json.dumps({'assets': [{'name': name} for name in ['old.dmg', 'old.apk', *self.uploaded]]})
        elif args[:2] in [('release', 'create'), ('release', 'edit')]:
            self.notes = Path(args[args.index('--notes-file') + 1]).read_text()
        elif args[:2] != ('release', 'delete-asset'):
            self.fail(f'Unexpected command {args}')
        return ''

    def test_existing_release_uploads_before_tag_and_removes_old_assets_last(self):
        release.publish(self.root)
        operations = [c[:2] for c in self.commands]
        upload = operations.index(('release', 'upload'))
        tag = operations.index(('api', '--method'))
        publish = operations.index(('release', 'edit'))
        delete = operations.index(('release', 'delete-asset'))
        self.assertLess(upload, tag)
        self.assertLess(tag, publish)
        self.assertLess(publish, delete)
        self.assertNotIn(('release', 'create'), operations)
        deleted = [c[3] for c in self.commands if c[:2] == ('release', 'delete-asset')]
        self.assertEqual(deleted, ['old.dmg', 'old.apk'])
        self.assertIn(SHA, self.notes)
        self.assertIn('--latest', self.commands[publish])

    def test_first_release_is_draft_until_upload_succeeds(self):
        self.existing = self.tag_exists = False
        release.publish(self.root)
        create = next(c for c in self.commands if c[:2] == ('release', 'create'))
        self.assertIn('--draft', create)
        tag = next(c for c in self.commands if c[:2] == ('api', '--method'))
        self.assertEqual(tag[2], 'POST')
        edit = next(c for c in self.commands if c[:2] == ('release', 'edit'))
        self.assertIn('--draft=false', edit)

    def test_failed_upload_preserves_previous_tag_notes_and_assets(self):
        self.fail_upload = True
        with self.assertRaises(subprocess.CalledProcessError):
            release.publish(self.root)
        self.assertFalse(any(c[:2] in [('api', '--method'), ('release', 'edit'),
                                      ('release', 'delete-asset')] for c in self.commands))

    def test_corrupt_package_rejected_before_remote_access(self):
        self.paths[1].write_bytes(b'corrupted')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            release.publish(self.root)
        self.assertEqual(self.commands, [])

    def test_wrong_commit_rejected_before_remote_access(self):
        manifest = self.paths[1].parent / 'manifest.json'
        data = json.loads(manifest.read_text())
        data['commit'] = 'b' * 40
        manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'different commit'):
            release.publish(self.root)
        self.assertEqual(self.commands, [])

    def test_missing_platform_rejected_before_remote_access(self):
        self.paths[0].unlink()
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            release.publish(self.root)
        self.assertEqual(self.commands, [])

    def test_newer_main_prevents_outdated_publication(self):
        self.head = 'b' * 40
        release.publish(self.root)
        self.assertEqual(len(self.commands), 1)

    def test_pr_or_manual_run_cannot_publish(self):
        for event in ['pull_request', 'workflow_dispatch']:
            with self.subTest(event=event), patch.dict(os.environ, {'GITHUB_EVENT_NAME': event}):
                with self.assertRaisesRegex(ValueError, 'pushes to main'):
                    release.publish(self.root)
        self.assertEqual(self.commands, [])


if __name__ == '__main__':
    unittest.main()
