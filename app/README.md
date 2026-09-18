# Tintin Player

A minimal Tauri 2 app with React, TypeScript, and Tailwind CSS. Choose a ROM and
see the key guide; after opening it, only the game is visible. Phones also show
small touch controls. Esc opens the in-game menu.

## Run

From the repository root, generate the C source once (`make bootstrap generate`).
The generator must remain at the revision pinned in `tools/project.py`.
Then:

```sh
cd app
npm ci
npm run tauri -- dev
```

Build the macOS application:

```sh
npm run tauri -- build
```

The `.app` is written to `src-tauri/target/release/bundle/macos/`.

For Android, configure `JAVA_HOME`, `ANDROID_HOME`, and `NDK_HOME` for JDK 17 and
your installed Android SDK/NDK. Initialize once, then build:

```sh
npm run tauri -- android init
npm run tauri -- android build --debug --target aarch64 --apk
```

The APK is under `src-tauri/gen/android/app/build/outputs/apk/`.
Debug APKs are for local testing; release distribution requires Android signing.

## Controls

| Action | Keys |
| --- | --- |
| Move | Arrow keys |
| A / B | Z / X |
| Start / Select | Enter / Backspace |
| Save state | Command+S on Mac, Ctrl+S elsewhere |
| Load manual state | Command+L on Mac, Ctrl+L elsewhere |
| Menu / resume | Esc |
| Mute | M |

Save and load are also available in the menu. Mobile touch controls include a
menu button. There are no function-key shortcuts.

## ROM and saves

Only the exact Europe En/Fr/De revision recorded in the root README is accepted.
The SHA-256 check happens in Rust before the C core sees the ROM. No raw ROM data
is embedded in the application: the build explicitly excludes `tintin_rom.c` and
adapts the generated initialization to use the selected ROM.

The picker remembers the last original path in local WebView storage. A verified
private copy of the selected ROM is stored in the app data directory, allowing
“Continue last game” even if an Android content URI grant has expired. Replacing
or deleting the original ROM does not remove that cached copy. No uploads occur.

App data uses Tauri's standard private data directory (`dev.tintin.player` on
macOS), partitioned by the ROM SHA-256. It contains:

- `last-rom.gbc`: imported ROM cache.
- `auto.state`: exit/background/periodic autosave.
- `quick.state`: manual checkpoint, independent of autosaves.

States are written to a temporary file, synchronized, then atomically renamed.
The newest compatible manual or automatic state is restored on opening a ROM.
A rejected state is preserved with an `incompatible-*` suffix and a visible message.
A failed exit save prevents desktop close and shows the error.

Autosave runs on desktop close/quit, Android suspension, WebView backgrounding,
and every 30 seconds during play. Force-killing a process cannot guarantee a
final save. Upstream save-state formats are runtime-version-specific; macOS to
Android save portability has not been established.

## Architecture and tests

`src/player.ts` owns the single-flight frame/audio loop. React renders the picker,
key guide, menu, and touch controls. The native core is the same generated Tintin
C and Game Boy runtime used by the SDL build. Rust serializes native entry points;
a small C bridge supplies pixels, PCM audio, input, and save-state access. SDL and
its window are not linked into the app. The frame budget uses system cycles at
the original 59.7275 Hz cadence, including CGB double-speed handling in the runtime.

```sh
npm run build
npm test
# Local integration test requires the ignored ROM in ../rom/:
cargo test --manifest-path src-tauri/Cargo.toml -- --ignored --nocapture
```

The local integration test covers ROM identity, unloaded-state behavior, restart
determinism, progression to gameplay, frame pacing, PCM output, save/load replay,
and malformed-state rejection. It writes a diagnostic PPM frame to `../logs/`.
This remains generated C with interpreter fallback; it is not a semantic rewrite
of the game or a whole-game compatibility guarantee.
