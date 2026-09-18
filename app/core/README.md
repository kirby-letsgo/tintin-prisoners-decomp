# Tracked C core

The app compiles the source files in `generated/tintin/` directly. They are tracked
as readable C/C++ and headers, together with the runtime sources and licenses.
There is no source archive to unpack and overwrite edits.

The runtime baseline is GB Recompiled revision
`9150f87d82fa98abcb6ea22329170463f9702eb8`. `manifest.json` records SHA-256 values
for the tracked source tree. CI checks these before compiling:

```sh
python3 tools/core_sources.py verify
```

After reviewed source edits or intentional regeneration, refresh the manifest and
commit it alongside the source changes:

```sh
python3 tools/core_sources.py record
```

`make generate` regenerates the C from your local ROM and overwrites source files;
review its diff before committing. The generated `tintin_rom.c` contains a full ROM
byte array and remains ignored. The large address-analysis metadata report is also
ignored. The app excludes the ROM array and requires the user to supply the exact
ROM at runtime. The standalone SDL build needs local regeneration to obtain that
ignored ROM array.
