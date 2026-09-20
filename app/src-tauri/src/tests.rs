#[cfg(test)]
mod tests {
    use crate::*;
    #[test]
    fn rejects_wrong_size() {
        assert!(validate_rom(&[0; 8]).is_err());
    }
    #[test]
    fn rejects_wrong_content() {
        assert!(validate_rom(&vec![0; ROM_LEN]).is_err());
    }
}

#[cfg(test)]
mod integration_tests {
    use crate::*;
    #[test]
    #[ignore = "requires the user's local ROM; run with --ignored --nocapture"]
    fn local_core_route() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let rom_path = std::fs::read_dir(root.join("rom"))
            .unwrap()
            .filter_map(Result::ok)
            .map(|e| e.path())
            .find(|p| p.extension().and_then(|e| e.to_str()) == Some("gbc"))
            .unwrap();
        let bytes = std::fs::read(rom_path).unwrap();
        validate_rom(&bytes).unwrap();
        let _lock = CORE.lock().unwrap();
        let mut packet = vec![0u8; PACKET_MAX];
        unsafe {
            tt_close();
        }
        assert_eq!(unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) }, 0);
        assert_eq!(unsafe { tt_load(bytes.as_ptr(), bytes.len()) }, 1);
        let n = unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) };
        let first = packet[..n].to_vec();
        assert_eq!(unsafe { tt_load(bytes.as_ptr(), bytes.len()) }, 1);
        let n = unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) };
        assert_eq!(
            first,
            packet[..n],
            "Restart should reproduce the first packet"
        );
        let mut completed = 0;
        let mut total_samples: u64 = 0;
        let mut nonzero_samples = false;
        let mut ticks = 0;
        while completed < 3000 && ticks < 8000 {
            let buttons = if (1250..1260).contains(&completed) || (2000..2010).contains(&completed)
            {
                16
            } else if (1600..1610).contains(&completed) || (2400..2410).contains(&completed) {
                128
            } else {
                0
            };
            let n = unsafe { tt_tick(buttons, packet.as_mut_ptr(), packet.len()) };
            let count = u32::from_le_bytes(packet[0..4].try_into().unwrap()) as usize;
            assert_eq!(n, 8 + 160 * 144 * 4 + count * 4);
            assert!(count <= 4096);
            completed = u32::from_le_bytes(packet[4..8].try_into().unwrap());
            total_samples += count as u64;
            nonzero_samples |= packet[8 + 160 * 144 * 4..n].iter().any(|b| *b != 0);
            ticks += 1;
        }
        assert!(
            ticks >= 2900,
            "The game is advancing faster than the physical frame cadence"
        );
        assert!(
            total_samples / (ticks as u64) < 780,
            "Audio is advancing too fast"
        );
        assert!(
            completed >= 3000,
            "Guest stopped progressing at {completed}"
        );
        assert!(nonzero_samples && total_samples > 44100);
        let colors: std::collections::HashSet<_> = packet[8..8 + 160 * 144 * 4]
            .chunks_exact(4)
            .map(|v| v.to_vec())
            .collect();
        assert!(colors.len() > 8, "Framebuffer appears blank");
        let mut ppm = b"P6\n160 144\n255\n".to_vec();
        for pixel in packet[8..8 + 160 * 144 * 4].chunks_exact(4) {
            ppm.extend_from_slice(&pixel[..3]);
        }
        std::fs::create_dir_all(root.join("logs")).unwrap();
        std::fs::write(root.join("logs/app-core-route.ppm"), ppm).unwrap();
        println!("Native bridge: {ticks} ticks, {completed} guest frames, {total_samples} stereo samples, {} colors", colors.len());
        let save = root.join("logs/app-test.state");
        save_to(&save).unwrap();
        let n = unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) };
        let after_save = packet[..n].to_vec();
        for _ in 0..8 {
            unsafe {
                tt_tick(16, packet.as_mut_ptr(), packet.len());
            }
        }
        restore_from(&save).unwrap();
        let n = unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) };
        assert_eq!(
            after_save,
            packet[..n],
            "Restoring should reproduce video and audio exactly"
        );
        let dir = root.join("logs/import-test");
        std::fs::create_dir_all(&dir).unwrap();
        let exported = capture(&dir).unwrap();
        let n = unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) };
        let expected = packet[..n].to_vec();
        import_bytes(&dir, &exported).unwrap();
        let n = unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) };
        assert_eq!(
            expected,
            packet[..n],
            "Export/import must reproduce the next frame and audio"
        );
        let before = capture(&dir).unwrap();
        let quick = std::fs::read(dir.join("quick.state")).unwrap();
        let auto = std::fs::read(dir.join("auto.state")).unwrap();
        let mut damaged = exported.clone();
        *damaged.last_mut().unwrap() ^= 1;
        assert!(import_bytes(&dir, &damaged).is_err());
        let incompatible = saves::encode(b"GBSVtruncated runtime state").unwrap();
        assert!(import_bytes(&dir, &incompatible).is_err());
        assert_eq!(
            capture(&dir).unwrap(),
            before,
            "Rejected import must not alter live state"
        );
        assert_eq!(std::fs::read(dir.join("quick.state")).unwrap(), quick);
        assert_eq!(std::fs::read(dir.join("auto.state")).unwrap(), auto);
        save_to(&dir.join("quick.state")).unwrap();
        std::fs::write(dir.join("quick.state"), b"interrupted write").unwrap();
        assert!(restore_manual(&dir).unwrap().contains("previous"));
        let n = unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) };
        assert_eq!(
            expected,
            packet[..n],
            "Backup must restore the previous manual checkpoint"
        );
        std::fs::remove_dir_all(&dir).unwrap();
        let invalid = root.join("logs/app-test-invalid.state");
        std::fs::write(&invalid, b"invalid").unwrap();
        assert!(restore_from(&invalid).is_err());
        unsafe {
            tt_close();
        }
        assert_eq!(unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) }, 0);
    }
}

#[cfg(feature = "asset-capture")]
mod asset_capture {
    use crate::*;
    extern "C" {
        fn tt_debug_lives() -> u8;
        fn tt_debug_scene() -> u8;
        fn tt_graphics_snapshot(out: *mut u8, capacity: usize) -> usize;
    }
    #[test]
    #[ignore = "local ROM required; starts all 31 playable scenes"]
    fn level_select_route() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let rom_path = std::fs::read_dir(root.join("rom"))
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| path.extension().is_some_and(|ext| ext == "gbc"))
            .unwrap();
        let rom = std::fs::read(rom_path).unwrap();
        validate_rom(&rom).unwrap();
        let _guard = CORE.lock().unwrap();
        unsafe {
            tt_close();
            assert_eq!(tt_start_level(0), 0, "No ROM loaded");
            assert_eq!(tintin_set_initial_lives(9), 1);
            assert_eq!(tt_load(rom.as_ptr(), rom.len()), 1);
        }
        // Optional scene filter lets independent test processes validate scenes
        // concurrently without sharing the runtime's process-global core.
        let scenes: Vec<u8> = match std::env::var("TT_LEVEL_SCENE") {
            Ok(value) => {
                let scene: u8 = value.parse().unwrap();
                assert!(scene < 31);
                vec![scene]
            }
            Err(_) => (0..31).collect(),
        };
        let dir = root
            .join("logs/level-select-test")
            .join(std::process::id().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let checkpoint = dir.join("checkpoint.state");
        let mut packet = vec![0; PACKET_MAX];
        for scene in scenes {
            assert_eq!(
                unsafe { tt_start_level(scene) },
                1,
                "Scene {scene} failed to start"
            );
            assert_eq!(unsafe { tt_debug_scene() }, scene);
            assert_eq!(unsafe { tt_debug_lives() }, 9);
            assert!(unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) } > 0);
            let frame = u32::from_le_bytes(packet[4..8].try_into().unwrap());
            assert!(frame > 1600 && frame < 5000);
            let pixels = &packet[8..8 + 160 * 144 * 4];
            assert!(
                pixels.chunks_exact(4).any(|p| p != &pixels[..4]),
                "Scene {scene} is blank"
            );
            std::fs::write(dir.join(format!("scene-{scene:02}.rgba")), pixels).unwrap();
            save_to(&checkpoint).unwrap();
            assert_eq!(
                unsafe { tt_start_level(31) },
                0,
                "Ending must not be selectable"
            );
            assert_eq!(unsafe { tt_start_level(255) }, 0);
            assert_eq!(unsafe { tt_debug_scene() }, scene);
            assert!(unsafe { tt_tick(1, packet.as_mut_ptr(), packet.len()) } > 0);
            restore_from(&checkpoint).unwrap();
            assert_eq!(unsafe { tt_debug_scene() }, scene);
            assert_eq!(unsafe { tt_debug_lives() }, 9);
            println!("Verified scene {scene}: startup, frame, lives, invalid selection, restore");
        }
        unsafe {
            tt_close();
            tintin_set_initial_lives(0);
        }
    }

    #[test]
    #[ignore = "requires local ROM; verifies new-game lives and save isolation"]
    fn starting_lives_route() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let path = std::fs::read_dir(root.join("rom"))
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| path.extension().is_some_and(|ext| ext == "gbc"))
            .unwrap();
        let rom = std::fs::read(path).unwrap();
        validate_rom(&rom).unwrap();
        let _guard = CORE.lock().unwrap();
        unsafe {
            assert_eq!(tintin_set_initial_lives(0), 1);
            assert_eq!(tintin_set_initial_lives(10), 0);
            assert_eq!(tintin_set_initial_lives(0), 1);
            assert_eq!(tt_load(rom.as_ptr(), rom.len()), 1);
        }
        let mut packet = vec![0; PACKET_MAX];
        let mut frame = 0;
        let mut configured = false;
        for _ in 0..5000 {
            let buttons = if (1250..1260).contains(&frame) || (2000..2010).contains(&frame) {
                16
            } else if (1600..1610).contains(&frame) || (2400..2410).contains(&frame) {
                128
            } else {
                0
            };
            assert!(unsafe { tt_tick(buttons, packet.as_mut_ptr(), packet.len()) } > 0);
            frame = u32::from_le_bytes(packet[4..8].try_into().unwrap());
            if frame >= 1500 && !configured {
                assert_eq!(unsafe { tintin_set_initial_lives(9) }, 1);
                configured = true;
            }
            if frame >= 3300 {
                break;
            }
        }
        assert!(frame >= 3300);
        assert_eq!(
            unsafe { tt_debug_lives() },
            9,
            "New game should use the configured lives"
        );
        std::fs::create_dir_all(root.join("logs")).unwrap();
        std::fs::write(
            root.join("logs/lives-nine.rgba"),
            &packet[8..8 + 160 * 144 * 4],
        )
        .unwrap();
        let save = root.join("logs/lives-test.state");
        save_to(&save).unwrap();
        assert_eq!(unsafe { tintin_set_initial_lives(1) }, 1);
        assert_eq!(
            unsafe { tt_debug_lives() },
            9,
            "Changing the preference must not change live progress"
        );
        restore_from(&save).unwrap();
        assert_eq!(
            unsafe { tt_debug_lives() },
            9,
            "Loading a save must retain its lives"
        );
        // Reproduce the reported case: an autosave with five lives is resumed,
        // then the user explicitly selects nine in the pause menu.
        unsafe { tt_apply_lives(5) };
        save_to(&save).unwrap();
        restore_from(&save).unwrap();
        assert_eq!(unsafe { tt_debug_lives() }, 5);
        unsafe {
            assert_eq!(tintin_set_initial_lives(9), 1);
            tt_apply_lives(9);
        }
        assert_eq!(unsafe { tt_debug_lives() }, 9);
        for _ in 0..30 {
            assert!(unsafe { tt_tick(0, packet.as_mut_ptr(), packet.len()) } > 0);
        }
        let mut graphics = vec![0; 32 + 16384 + 160 + 128 + 160 * 144 * 4];
        assert_eq!(unsafe { tt_graphics_snapshot(graphics.as_mut_ptr(), graphics.len()) }, graphics.len());
        assert_eq!(graphics[32 + 0x1e28], 11, "HUD ones digit must be 9 (tile offset 2)");
        std::fs::write(root.join("logs/lives-live-nine.rgba"), &packet[8..8 + 160 * 144 * 4]).unwrap();
        save_to(&save).unwrap();
        unsafe { tt_apply_lives(3) };
        assert_eq!(unsafe { tt_debug_lives() }, 3);
        restore_from(&save).unwrap();
        assert_eq!(unsafe { tt_debug_lives() }, 9, "Explicit edits persist in saves");
        unsafe {
            tt_apply_lives(0);
            tt_apply_lives(10);
        }
        assert_eq!(unsafe { tt_debug_lives() }, 9, "Default/invalid values must not overwrite current lives");
        unsafe {
            tt_close();
            tintin_set_initial_lives(0);
        }
        println!("Verified new-game lives, live 5→9 edit, HUD redraw, and save restoration.");
    }
    #[test]
    #[ignore = "local ROM and generated sprite template required"]
    fn sprite_pack_route() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let path = std::fs::read_dir(root.join("rom"))
            .unwrap()
            .filter_map(Result::ok)
            .map(|e| e.path())
            .find(|p| p.extension().is_some_and(|e| e == "gbc"))
            .unwrap();
        let rom = std::fs::read(path).unwrap();
        validate_rom(&rom).unwrap();
        let original_pack = std::fs::read(root.join("logs/tintin-original.ttspk")).unwrap();
        let _guard = CORE.lock().unwrap();
        unsafe {
            tintin_set_initial_lives(0);
            assert_eq!(
                tt_sprites_load(original_pack.as_ptr(), original_pack.len()),
                1
            );
            assert_eq!(tt_load(rom.as_ptr(), rom.len()), 1);
        }
        let mut packet = vec![0; PACKET_MAX];
        let mut hd = vec![0; HD_BYTES];
        let mut graphics = vec![0; 32 + 16384 + 160 + 128 + 160 * 144 * 4];
        let mut frame = 0;
        let mut bucket = u32::MAX;
        let mut checked = 0;
        for _ in 0..6000 {
            let buttons = if (1250..1260).contains(&frame) || (2000..2010).contains(&frame) {
                16
            } else if (1600..1610).contains(&frame) || (2400..2410).contains(&frame) {
                128
            } else if (3100..3450).contains(&frame) {
                1
            } else if (3500..3800).contains(&frame) {
                2
            } else {
                0
            };
            assert!(unsafe { tt_tick(buttons, packet.as_mut_ptr(), packet.len()) } > 0);
            frame = u32::from_le_bytes(packet[4..8].try_into().unwrap());
            if frame >= 1200 && frame / 6 != bucket {
                assert_eq!(unsafe { tt_hd_frame(hd.as_mut_ptr(), hd.len()) }, HD_BYTES);
                for y in 0..288 {
                    for x in 0..320 {
                        let hi = (y * 320 + x) * 4;
                        let lo = 8 + ((y / 2) * 160 + x / 2) * 4;
                        assert_eq!(
                            &hd[hi..hi + 4],
                            &packet[lo..lo + 4],
                            "Identity pack differs at frame {frame}, ({x},{y})"
                        );
                    }
                }
                let n = unsafe { tt_graphics_snapshot(graphics.as_mut_ptr(), graphics.len()) };
                let baseline = root.join(format!("logs/code-study/captures/frame-{frame:05}.bin"));
                assert_eq!(
                    &graphics[..n],
                    std::fs::read(baseline).unwrap(),
                    "Guest output changed with the pack enabled"
                );
                if frame == 3300 {
                    std::fs::write(root.join("logs/sprite-identity.rgba"), &hd).unwrap();
                }
                bucket = frame / 6;
                checked += 1;
            }
            if frame >= 4200 {
                break;
            }
        }
        assert_eq!(checked, 501);
        let save = root.join("logs/sprite-pack-test.state");
        save_to(&save).unwrap();
        let mut edited = original_pack.clone();
        for record in edited[12..].chunks_exact_mut(1048) {
            for (i, pixel) in record[24..].chunks_exact_mut(4).enumerate() {
                if pixel[3] != 0 {
                    pixel[0] = if i % 2 == 0 { 255 } else { 0 };
                    pixel[1] = 0;
                    pixel[2] = 255;
                }
            }
        }
        assert_eq!(unsafe { tt_sprites_load(edited.as_ptr(), edited.len()) }, 1);
        restore_from(&save).unwrap();
        for _ in 0..12 {
            unsafe {
                tt_tick(0, packet.as_mut_ptr(), packet.len());
            }
        }
        assert_eq!(unsafe { tt_hd_frame(hd.as_mut_ptr(), hd.len()) }, HD_BYTES);
        let mut differences = 0;
        let mut detailed_pixels = 0;
        for y in 0..144 {
            for x in 0..160 {
                let hi = (y * 2 * 320 + x * 2) * 4;
                let lo = 8 + (y * 160 + x) * 4;
                if hd[hi..hi + 4] != packet[lo..lo + 4] {
                    differences += 1;
                }
                if hd[hi..hi + 4] != hd[hi + 4..hi + 8] {
                    detailed_pixels += 1;
                }
            }
        }
        assert!(
            differences > 50 && detailed_pixels > 50,
            "Replacement art was not rendered at true 2x detail"
        );
        std::fs::write(root.join("logs/sprite-edited.rgba"), &hd).unwrap();
        unsafe {
            tt_sprites_clear();
        }
        assert_eq!(unsafe { tt_hd_frame(hd.as_mut_ptr(), hd.len()) }, 0);
        restore_from(&save).unwrap();
        unsafe {
            tt_close();
        }
        println!("Verified {checked} identical guest snapshots and identity-pack frames; edited art changed {differences} pixels with {detailed_pixels} subpixel details after save restore.");
    }
    #[test]
    #[ignore = "local ROM required; invoked by tools/sprites.py capture"]
    fn capture_sprite_route() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let path = std::env::var("TINTIN_CAPTURE_ROM").expect("Use tools/sprites.py capture");
        let out = PathBuf::from(std::env::var("TINTIN_CAPTURE_OUT").unwrap());
        assert!(out.starts_with(root.canonicalize().unwrap()));
        std::fs::create_dir_all(&out).unwrap();
        let rom = std::fs::read(path).unwrap();
        validate_rom(&rom).unwrap();
        let _guard = CORE.lock().unwrap();
        assert_eq!(unsafe { tt_load(rom.as_ptr(), rom.len()) }, 1);
        let mut packet = vec![0; PACKET_MAX];
        let mut graphics = vec![0; 32 + 16384 + 160 + 128 + 160 * 144 * 4];
        let mut frame = 0;
        let mut last_bucket = u32::MAX;
        let mut count = 0;
        for _ in 0..6000 {
            let buttons = if (1250..1260).contains(&frame) || (2000..2010).contains(&frame) {
                16
            } else if (1600..1610).contains(&frame) || (2400..2410).contains(&frame) {
                128
            } else if (3100..3450).contains(&frame) {
                1
            } else if (3500..3800).contains(&frame) {
                2
            } else {
                0
            };
            assert!(unsafe { tt_tick(buttons, packet.as_mut_ptr(), packet.len()) } > 0);
            frame = u32::from_le_bytes(packet[4..8].try_into().unwrap());
            if frame >= 1200 && frame / 6 != last_bucket {
                let n = unsafe { tt_graphics_snapshot(graphics.as_mut_ptr(), graphics.len()) };
                if n > 0 {
                    std::fs::write(out.join(format!("frame-{frame:05}.bin")), &graphics[..n])
                        .unwrap();
                    count += 1;
                }
                last_bucket = frame / 6;
            }
            if frame >= 4200 {
                break;
            }
        }
        unsafe {
            tt_close();
        }
        assert!(
            frame >= 4200 && count > 400,
            "Capture route did not complete"
        );
        println!("Captured {count} VBlank snapshots through frame {frame}");
    }
}
