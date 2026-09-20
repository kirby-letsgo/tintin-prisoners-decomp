# Tintin: Prisoners of the Sun

Play the Game Boy Color game on **macOS (Apple Silicon)** and **Android (ARM64)**,
with keyboard, touch or controller input, save states, and optional display effects.

**[Download the latest DMG or APK](https://github.com/kirby-letsgo/tintin-prisoners-decomp/releases/tag/rolling)**

This is an unofficial fan project. You need your own **Europe (English/French/German)
Game Boy Color ROM**, exactly 1 MiB. The game is not included in the download.

## Get started

1. Download the **DMG** for your Mac or the **APK** for your Android phone.
2. On macOS, open the DMG and drag Tintin Player to Applications. On Android, open
   the APK and allow installation from your browser or file manager if prompted.
3. Launch the app, choose **Add a ROM**, and select your `.gbc` file.

The app remembers the ROM on your device. Next time, choose **Continue** to resume.
**Restart run** begins at the first level using your lives setting. **Level select**
lets you jump to a main level; press **Play** to start there.

## Controls

Phones show touch controls. A supported controller hides them while connected;
disconnecting it pauses the game and restores the touch controls.

| Action | Keyboard | Controller (standard layout) |
| --- | --- | --- |
| Move | Arrow keys | D-pad or left stick |
| Game Boy A | Z | Bottom face button (Xbox A / PlayStation cross) |
| Game Boy B | X | Right face button (Xbox B / PlayStation circle) |
| Game Start | Enter | Start / Menu / Options |
| Game Select | Backspace | Back / View / Share |
| App pause menu / resume | Esc | Left shoulder (LB / L1) |
| Save state | ⌘S on Mac, Ctrl+S elsewhere | Use the pause menu |
| Load state | ⌘L on Mac, Ctrl+L elsewhere | Use the pause menu |
| Mute | M | Picture & sound in the pause menu |

Connect your controller over Bluetooth or USB, then press a button while the app
is focused. Controllers must be recognised with the standard Gamepad layout.
Hardware support depends on the device and its WebView; non-standard mappings are
not currently supported.

In menus, use **up/down** to move between controls, **left/right** to change a
selected option, and the **bottom face button** to select. The **right face button**
resumes from the pause menu. Use your phone or mouse for system file pickers.

## Saves

Progress is saved automatically every 30 seconds, when returning to the main menu,
and when closing or backgrounding the app. A force-stop may lose progress since
the last autosave. The app keeps a backup and attempts recovery if a save is damaged.

- **Save state / Load state** gives you a separate manual checkpoint.
- **Save files & ROM → Export save** writes a `.tintinsave` file you can keep elsewhere.
- **Import save** restores an exported checkpoint. Export before uninstalling or
  clearing app data. On Android, uninstalling removes local saves and the cached ROM.

Continue opens the newest compatible automatic or manual save. Save transfer
between macOS and Android has not yet been verified.

## Picture and game options

Open the pause menu to change:

- **Picture & sound:** original pixels, smoothing, LCD grid or CRT scanlines;
  whole-pixel or fit-to-screen scaling; sound on/off.
- **Game options:** original lives settings or 1–9 lives. Choosing a number sets
  your current lives and starting lives for new runs. Game default affects new runs only.

The player uses the original game graphics. Display effects do not change gameplay.

## Updates and help

The **rolling release** is refreshed after successful builds from `main`.
Install a newer package to update. Keep an exported save before reinstalling.

If something goes wrong, [open an issue](https://github.com/kirby-letsgo/tintin-prisoners-decomp/issues)
with your device, app build, and steps to reproduce it. For controller problems,
include the controller model and whether it uses Bluetooth or USB. Do not attach ROMs.

For build instructions and code research, see [Development](DEVELOPMENT.md),
[the app guide](app/README.md), and [release builds](releases.md).
