# Tauri app validation — 2026-09-18

- React + TypeScript + Tailwind production frontend build passed.
- macOS ARM64 Tauri debug application bundled and opened successfully.
- The native macOS key guide was inspected: Command+S / Command+L, Esc, M,
  arrows, Z/X, Enter/Backspace. No function keys remain in the app.
- Android ARM64 debug APK built successfully with SDK 36, NDK 27.1, and JDK 17.
  Android device interaction has not been tested.
- Rust ROM-size and ROM-hash rejection tests passed.
- The local native bridge integration test passed: 3,042 presentation ticks,
  3,000 completed guest frames, 2,246,101 stereo samples, and a nonblank 18-color
  gameplay capture. The frame cadence check guards against double-counting CGB
  double-speed mode.
- Restart reproduced the initial video/audio packet.
- Atomic save, advance, restore, and replay reproduced the next video/audio packet
  exactly; a malformed state was rejected.
- The standalone SDL runtime remains available and was not modified.

The UI automation check was stopped when the user began interacting with the
app. Automated end-to-end testing of the native file picker and save shortcuts
was therefore not completed. Core tests cover the backend paths separately.

Logs are under `logs/app-*`; the diagnostic core screenshot is
`logs/app-core-route.ppm`. Generated sources, tool/build directories, ROMs, and
runtime artifacts remain ignored. No commit has been created.
