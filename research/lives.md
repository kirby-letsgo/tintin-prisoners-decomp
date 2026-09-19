# Starting lives

The HUD's lives value is WRAM bank 1 `$DF87`. At `03:5687` the game selects HUD
staging address `$DE97`, reads `$DF87` at `03:568A`, divides by 10, then writes the
two digit tiles with tile-ID offset 2. The existing graphics trace observes those
tiles copied into `$9E27/$9E28` by `02:4CBF`; the ones digit is 7, representing 5.

The new-game path at `00:0A80` indexes table `$0AC9` using `$DED9`. The three table
bytes are **7, 5, 3**, matching difficulty-dependent starting lives. `00:0A8A`
reads the table value and `00:0A8B` writes `$DF87`. The loss path decrements this
counter at `00:2AC0` and stores it at `00:2AC1`; extra-life paths increment it at
`02:616B` and `03:6F51`.

The player exposes **Game default** (0 internally) and explicit values **1–9**.
Only the result of the table read at `00:0A8A` is overridden. The original read,
instruction timing, flags, and subsequent store remain in place. This is an
intentional gameplay modification, separate from the semantic naming work.
Game default preserves the difficulty table and the original replay output.

The setter does not write guest RAM. It is serialized with game execution by the
Rust core mutex. Changing the preference affects the next initialization; it does
not replenish lives in a running game. Loading a save retains that save's counter.
The frontend remembers the choice and supplies it before loading the ROM.
Use the pause menu before starting a new game from the game's title screen.

## Validation

```sh
cargo test --locked --manifest-path app/src-tauri/Cargo.toml \
  --features asset-capture starting_lives_route -- --ignored --nocapture
python3 tools/study_animation.py capture
```

The local-ROM test rejects out-of-range values, changes the preference from game
default to 9 at the title screen, checks the actual counter at gameplay frame
3300, changes the preference to 1, and verifies the running and restored save
still retain 9 lives. It emits `logs/lives-nine.rgba` for HUD inspection.
The game-default replay is compared with the original snapshots separately.

An earlier candidate, `$C3F8`, was rejected because the gameplay test read zero
there. Its reads in the bank-6 graphics routines feed timing/status waits, not the
HUD number. There is no lives modification at `$096C`.

After regenerating the core, reapply `game-options.patch` as described in the
research README. The original ROM file is never modified.
