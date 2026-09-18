# GitHub builds

Release builds run in `.github/workflows/build.yml` on pushes to `main`, version
tags, pull requests, and Actions → Build apps → Run workflow. No ROM or private
save is sent to CI. The tracked C sources are verified and compiled directly; no archive overwrites source edits.

Download the workflow artifacts:

- **Tintin-Player-macOS-arm64**: zipped Apple Silicon `.app`, ad-hoc signed.
  It is not Apple-notarized; macOS may require allowing it in Privacy & Security.
- **Tintin-Player-Android-arm64**: signed ARM64 APK for Android 7+.
  Without signing secrets the filename ends in **test-signed** and uses a disposable
  test key. Export saves before uninstalling an older build to install one signed
  with a different key. This is release-mode code, not a debug APK.

Every artifact includes `manifest.json` with its commit, size and SHA-256.
Rust uses size optimization, thin LTO and stripped symbols. C uses `-Os` without
debug info. Android also shrinks Java code and resources. Raw ROM arrays and SDL
are not linked. Actual package sizes are printed by CI, not estimated locally.

## Stable Android signing

For installable updates that preserve app data, configure these Actions repository
secrets (Settings → Secrets and variables → Actions):

- `ANDROID_KEYSTORE_BASE64`: base64 of your private release keystore.
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Keep the original key backed up privately. The signing helper writes it only to a
runner temporary directory and deletes it after signing; keys are never artifacts.
It fails if only part of the signing configuration is supplied. Fork PRs receive
no repository secrets and produce test-signed builds. Signed APKs are verified
with `apksigner` before upload. No GitHub Release or app-store publishing occurs.

## Repeatable commands (used by CI)

```sh
python3 tools/core_sources.py verify
npm ci --prefix app
npm run build --prefix app
cargo test --locked --manifest-path app/src-tauri/Cargo.toml
# macOS runner:
APPLE_SIGNING_IDENTITY=- npm --prefix app run tauri -- build --ci --bundles app -- --locked
# Android runner, JDK 17 / SDK 36 / NDK 27.1.12297006:
npm --prefix app run tauri -- android build --ci --target aarch64 --apk
python3 tools/sign_android.py
python3 tools/artifact_manifest.py artifacts
```

Rust 1.95.0, Node 24, NDK and Android build-tools versions are pinned in the
workflow. npm and Cargo dependencies use their committed lockfiles. Android's
Tauri CLI uses Cargo.lock; commit any intentional dependency updates explicitly.
CI unit tests cover durable-save failures without needing a ROM. Full native game
replay tests remain local because they require the user's ROM.
