//! Durable save envelopes and two-generation commits. Never promote a pending file.
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, FileTimes, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const MAGIC: &[u8; 8] = b"TTSTATE1";
const CORE_REVISION: &str = "9150f87d82fa98abcb6ea22329170463f9702eb8";
const HEADER: usize = 8 + 64 + 40 + 4 + 32;
pub const MAX_FILE: usize = 1024 * 1024;
type Result<T> = std::result::Result<T, String>;

pub fn encode(payload: &[u8]) -> Result<Vec<u8>> {
    if payload.is_empty() || payload.len() > MAX_FILE - HEADER {
        return Err("Invalid save size.".into());
    }
    let mut data = Vec::with_capacity(HEADER + payload.len());
    data.extend_from_slice(MAGIC);
    data.extend_from_slice(crate::ROM_HASH.as_bytes());
    data.extend_from_slice(CORE_REVISION.as_bytes());
    data.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    let mut checksum = Sha256::new();
    checksum.update(&data);
    checksum.update(payload);
    data.extend_from_slice(&checksum.finalize());
    data.extend_from_slice(payload);
    Ok(data)
}
pub fn decode(data: &[u8]) -> Result<&[u8]> {
    if data.len() < HEADER || data.len() > MAX_FILE || &data[..8] != MAGIC {
        return Err("Choose a Tintin .tintinsave export.".into());
    }
    if &data[8..72] != crate::ROM_HASH.as_bytes() {
        return Err("This save belongs to a different ROM.".into());
    }
    if &data[72..112] != CORE_REVISION.as_bytes() {
        return Err("This save uses a different game runtime.".into());
    }
    let size = u32::from_le_bytes(data[112..116].try_into().unwrap()) as usize;
    if size == 0 || data.len() != HEADER + size {
        return Err("This save is incomplete or has extra data.".into());
    }
    let mut checksum = Sha256::new();
    checksum.update(&data[..116]);
    checksum.update(&data[HEADER..]);
    if checksum.finalize()[..] != data[116..HEADER] {
        return Err("Save checksum failed. The file may be damaged or incomplete.".into());
    }
    Ok(&data[HEADER..])
}
pub fn local_payload(data: &[u8]) -> Result<&[u8]> {
    // The previous app wrote the runtime's raw v9 state. Allow migration locally,
    // but require a checksummed envelope for files imported from outside the app.
    if data.starts_with(b"GBSV") && data.len() <= MAX_FILE {
        Ok(data)
    } else {
        decode(data)
    }
}
pub fn read_bounded(path: &Path) -> Result<Vec<u8>> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut data = Vec::new();
    file.take((MAX_FILE + 1) as u64)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() > MAX_FILE {
        return Err("Save file is too large.".into());
    }
    Ok(data)
}
pub fn backup(path: &Path) -> PathBuf {
    path.with_extension("backup.state")
}
fn sync_dir(dir: &Path) -> Result<()> {
    #[cfg(unix)]
    File::open(dir)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(())
}
pub fn stage(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())
}
pub fn quarantine(path: &Path) -> Result<PathBuf> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let rejected = path.with_extension(format!("rejected-{stamp}"));
    fs::rename(path, &rejected).map_err(|e| e.to_string())?;
    sync_dir(path.parent().ok_or("Save directory missing")?)?;
    Ok(rejected)
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Stage {
    NewSynced,
    BackupSynced,
    BackupInstalled,
    NewInstalled,
}

pub fn commit(path: &Path, bytes: &[u8], valid: impl Fn(&[u8]) -> bool) -> Result<()> {
    commit_with_hook(path, bytes, valid, |_| Ok(()))
}
// Hook injects failures at durable boundaries; the shipping path always succeeds.
fn commit_with_hook(
    path: &Path,
    bytes: &[u8],
    valid: impl Fn(&[u8]) -> bool,
    hook: impl Fn(Stage) -> Result<()>,
) -> Result<()> {
    if !valid(bytes) {
        return Err("Refusing to save an invalid state.".into());
    }
    let parent = path.parent().ok_or("Save directory missing")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let old = if path.exists() {
        match read_bounded(path) {
            Ok(old) if valid(&old) => Some(old),
            _ => {
                quarantine(path)?;
                None
            }
        }
    } else {
        None
    };
    if old.as_deref() == Some(bytes) {
        return Ok(());
    }
    let pending = path.with_extension("pending");
    stage(&pending, bytes)?;
    sync_dir(parent)?;
    hook(Stage::NewSynced)?;
    if let Some(old) = old {
        let pending_backup = path.with_extension("backup.pending");
        stage(&pending_backup, &old)?;
        // Preserve chronology when selecting the newest valid save across slots.
        let modified = fs::metadata(path)
            .and_then(|m| m.modified())
            .map_err(|e| e.to_string())?;
        let file = OpenOptions::new()
            .write(true)
            .open(&pending_backup)
            .map_err(|e| e.to_string())?;
        file.set_times(FileTimes::new().set_modified(modified))
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        hook(Stage::BackupSynced)?;
        fs::rename(&pending_backup, backup(path)).map_err(|e| e.to_string())?;
        sync_dir(parent)?;
        hook(Stage::BackupInstalled)?;
    }
    fs::rename(&pending, path).map_err(|e| e.to_string())?;
    sync_dir(parent)?;
    hook(Stage::NewInstalled)?;
    Ok(())
}
pub fn candidates(dir: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<_> = [
        "auto.state",
        "quick.state",
        "auto.backup.state",
        "quick.backup.state",
    ]
    .into_iter()
    .map(|name| dir.join(name))
    .filter(|p| p.is_file())
    .collect();
    paths.sort_by_key(|p| std::cmp::Reverse(fs::metadata(p).and_then(|m| m.modified()).ok()));
    paths
}
pub fn recover(dir: &Path, restore: impl Fn(&Path) -> Result<()>) -> Result<String> {
    let mut rejected = false;
    for candidate in candidates(dir) {
        if restore(&candidate).is_ok() {
            let is_backup = candidate
                .file_name()
                .unwrap()
                .to_string_lossy()
                .contains(".backup.");
            return Ok(if is_backup || rejected {
                "Recovered your progress from an earlier valid save. Damaged files were preserved."
                    .into()
            } else {
                String::new()
            });
        }
        quarantine(&candidate)?;
        rejected = true;
    }
    Ok(if rejected {
        "No compatible save could be recovered. Damaged saves were preserved; the game will start from the beginning.".into()
    } else {
        String::new()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../logs/save-tests");
            fs::create_dir_all(&root).unwrap();
            loop {
                // Clock precision is not uniqueness: parallel tests can observe
                // the same timestamp and otherwise delete each other's files.
                let id = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
                let dir = root.join(format!("{}-{id}", std::process::id()));
                match fs::create_dir(&dir) {
                    Ok(()) => return Self(dir),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) => panic!("Could not create test directory: {error}"),
                }
            }
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn parallel_test_directories_are_independent() {
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(16));
        let workers: Vec<_> = (0..16)
            .map(|_| {
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    Temp::new()
                })
            })
            .collect();
        let mut dirs: Vec<_> = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect();
        let unique: std::collections::HashSet<_> = dirs.iter().map(|dir| dir.0.clone()).collect();
        assert_eq!(unique.len(), dirs.len());
        drop(dirs.pop());
        assert!(dirs.iter().all(|dir| dir.0.is_dir()));
    }

    fn valid(data: &[u8]) -> bool {
        decode(data).is_ok()
    }
    #[test]
    fn rejects_corruption_truncation_wrong_rom_and_trailing_bytes() {
        let data = encode(b"first snapshot").unwrap();
        assert_eq!(decode(&data).unwrap(), b"first snapshot");
        for size in [0, 7, HEADER - 1, data.len() - 1] {
            assert!(decode(&data[..size]).is_err());
        }
        for offset in [0, 8, 72, 116, HEADER] {
            let mut bad = data.clone();
            bad[offset] ^= 1;
            assert!(decode(&bad).is_err());
        }
        let mut trailing = data;
        trailing.push(0);
        assert!(decode(&trailing).is_err());
        assert!(decode(b"GBSVold raw save").is_err());
        assert!(local_payload(b"GBSVold raw save").is_ok());
    }
    #[test]
    fn interruption_at_every_commit_boundary_preserves_recoverable_state() {
        for cut in [
            Stage::NewSynced,
            Stage::BackupSynced,
            Stage::BackupInstalled,
            Stage::NewInstalled,
        ] {
            let dir = Temp::new();
            let path = dir.0.join("auto.state");
            let first = encode(b"first").unwrap();
            let second = encode(b"second").unwrap();
            let third = encode(b"third").unwrap();
            commit(&path, &first, valid).unwrap();
            commit(&path, &second, valid).unwrap();
            assert!(
                commit_with_hook(&path, &third, valid, |point| if point == cut {
                    Err("simulated interruption".into())
                } else {
                    Ok(())
                })
                .is_err()
            );
            let current = read_bounded(&path).unwrap();
            assert_eq!(
                decode(&current).unwrap(),
                if cut == Stage::NewInstalled {
                    b"third".as_slice()
                } else {
                    b"second".as_slice()
                }
            );
            assert!(valid(&read_bounded(&backup(&path)).unwrap()));
            assert!(!candidates(&dir.0)
                .iter()
                .any(|p| p.extension().unwrap() == "pending"));
            commit(&path, &third, valid).unwrap();
            assert_eq!(read_bounded(&path).unwrap(), third);
        }
    }
    #[test]
    fn partial_pending_is_ignored_and_corrupt_primary_recovers_backup() {
        let dir = Temp::new();
        let path = dir.0.join("auto.state");
        let first = encode(b"first").unwrap();
        let second = encode(b"second").unwrap();
        commit(&path, &first, valid).unwrap();
        commit(&path, &second, valid).unwrap();
        stage(&path.with_extension("pending"), &second[..20]).unwrap();
        assert_eq!(read_bounded(&path).unwrap(), second);
        stage(&path, b"torn primary").unwrap();
        let message = recover(&dir.0, |p| {
            decode(&read_bounded(p)?)?;
            Ok(())
        })
        .unwrap();
        assert!(message.contains("Recovered"));
        assert!(!path.exists());
        assert_eq!(read_bounded(&backup(&path)).unwrap(), first);
        assert!(fs::read_dir(&dir.0)
            .unwrap()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().contains("rejected")));
        commit(&path, &second, valid).unwrap();
        assert_eq!(read_bounded(&backup(&path)).unwrap(), first);
    }
    #[test]
    fn failed_or_duplicate_write_does_not_destroy_backup() {
        let dir = Temp::new();
        let path = dir.0.join("auto.state");
        let first = encode(b"first").unwrap();
        let second = encode(b"second").unwrap();
        commit(&path, &first, valid).unwrap();
        commit(&path, &second, valid).unwrap();
        commit(&path, &second, valid).unwrap();
        assert_eq!(read_bounded(&backup(&path)).unwrap(), first);
        assert!(commit(&path, b"invalid", valid).is_err());
        assert_eq!(read_bounded(&path).unwrap(), second);
        fs::create_dir(path.with_extension("pending")).unwrap();
        assert!(commit(&path, &encode(b"third").unwrap(), valid).is_err());
        assert_eq!(read_bounded(&path).unwrap(), second);
        assert_eq!(read_bounded(&backup(&path)).unwrap(), first);
    }
}
