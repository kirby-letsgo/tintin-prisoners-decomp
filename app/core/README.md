# ROM-free CI input

`tintin-core.tar.xz` contains generated Tintin C instructions and the required
GB Recompiled runtime sources/headers, pinned at
`9150f87d82fa98abcb6ea22329170463f9702eb8`.
It is ROM-derived code, not a clean-room rewrite. It excludes `tintin_rom.c`,
the raw ROM, game assets, SDL, and generated standalone executables.
The runtime MIT license is included as `LICENSE.runtime` inside the archive.
The upstream runtime license does not license the game's original content.

`manifest.json` records the archive and every member's SHA-256.
`python3 tools/core_bundle.py unpack` validates before writing any source files.
CI can compile from a fresh checkout without uploading or regenerating a ROM.

To refresh after intentionally regenerating the pinned core locally:

```sh
make generate
python3 tools/core_bundle.py pack
python3 tools/core_bundle.py verify
```

The archive uses sorted members and fixed file metadata for reproducible output.
Review the manifest and generator changes together when updating the core.
