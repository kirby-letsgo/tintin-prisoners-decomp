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
