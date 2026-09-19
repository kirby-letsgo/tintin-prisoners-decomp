use sha2::{Digest, Sha256};
use std::{
    ffi::CString,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    Emitter, Manager,
};

mod saves;

const ROM_LEN: usize = 1048576;
const ROM_HASH: &str = "4c859ad08f74bcc004f01a69a7d380cdcdea79eb731a09f935337921096e4c20";
const HD_BYTES: usize = 320 * 288 * 4;
const SPRITE_MAX: usize = 12 + 1024 * 1048;
const PACKET_MAX: usize = 8 + 160 * 144 * 4 + 4096 * 4;
// Upstream globals require one lock around every native call, including lifecycle saves.
static CORE: Mutex<bool> = Mutex::new(false);
extern "C" {
    fn tt_load(rom: *const u8, len: usize) -> i32;
    fn tt_close();
    fn tt_sprites_load(data: *const u8, length: usize) -> i32;
    fn tt_sprites_active() -> i32;
    fn tt_sprites_clear();
    fn tt_hd_frame(out: *mut u8, capacity: usize) -> usize;
    fn tintin_set_initial_lives(lives: u8) -> i32;
    fn tt_tick(buttons: u8, packet: *mut u8, capacity: usize) -> usize;
    fn tt_save(path: *const std::ffi::c_char) -> i32;
    fn tt_validate(path: *const std::ffi::c_char) -> i32;
    fn tt_restore(path: *const std::ffi::c_char) -> i32;
}
fn validate_rom(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() != ROM_LEN {
        return Err("Choose the 1 MiB Europe ROM (English/French/German).".into());
    }
    if format!("{:x}", Sha256::digest(bytes)) != ROM_HASH {
        return Err(
            "This ROM does not match Tintin: Prisoners of the Sun, Europe En/Fr/De.".into(),
        );
    }
    Ok(())
}
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(ROM_HASH);
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}
fn cpath(path: &Path) -> Result<CString, String> {
    CString::new(path.to_str().ok_or("Save path is not UTF-8")?).map_err(|e| e.to_string())
}
// All helpers run with CORE held; scratch files are app-private and bounded.
fn capture(dir: &Path) -> Result<Vec<u8>, String> {
    let raw = dir.join("capture.pending");
    let name = cpath(&raw)?;
    if unsafe { tt_save(name.as_ptr()) } == 0 {
        return Err("Could not capture the game state.".into());
    }
    let bytes = saves::read_bounded(&raw)?;
    if unsafe { tt_validate(name.as_ptr()) } == 0 {
        return Err("The captured state could not be verified.".into());
    }
    let _ = std::fs::remove_file(&raw);
    saves::encode(&bytes)
}
fn validate_state(dir: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    let payload = saves::local_payload(bytes)?;
    let raw = dir.join("validate.pending");
    saves::stage(&raw, payload)?;
    if unsafe { tt_validate(cpath(&raw)?.as_ptr()) } == 0 {
        return Err("This state is not compatible with the current game runtime.".into());
    }
    Ok(raw)
}
fn commit_state(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("Save directory missing")?;
    saves::commit(path, bytes, |data| validate_state(dir, data).is_ok())
}
fn save_to(path: &Path) -> Result<(), String> {
    let bytes = capture(path.parent().ok_or("Save directory missing")?)?;
    commit_state(path, &bytes)
}
fn restore_from(path: &Path) -> Result<(), String> {
    let dir = path.parent().ok_or("Save directory missing")?;
    let raw = validate_state(dir, &saves::read_bounded(path)?)?;
    if unsafe { tt_restore(cpath(&raw)?.as_ptr()) } == 0 {
        return Err("Could not restore the state. Current progress is unchanged.".into());
    }
    let _ = std::fs::remove_file(raw);
    Ok(())
}
fn autosave(app: &tauri::AppHandle) -> Result<(), String> {
    let loaded = CORE.lock().map_err(|_| "Game state unavailable")?;
    if *loaded {
        save_to(&data_dir(app)?.join("auto.state"))?;
    }
    Ok(())
}
fn load_bytes(app: &tauri::AppHandle, bytes: &[u8]) -> Result<String, String> {
    validate_rom(bytes)?;
    let dir = data_dir(app)?;
    let mut loaded = CORE.lock().map_err(|_| "Game state unavailable")?;
    if *loaded {
        save_to(&dir.join("auto.state"))?;
    }
    // Keep the imported ROM private, so Android can reopen it after the document
    // provider's temporary URI permission expires. No ROM is bundled with the app.
    let temp = dir.join("last-rom.pending");
    std::fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, dir.join("last-rom.gbc")).map_err(|e| e.to_string())?;
    if unsafe { tt_load(bytes.as_ptr(), bytes.len()) } == 0 {
        return Err("Could not initialize the game.".into());
    }
    *loaded = true;
    saves::recover(&dir, restore_from)
}

#[tauri::command]
fn set_starting_lives(lives: u8) -> Result<(), String> {
    let _guard = CORE.lock().map_err(|_| "Game state unavailable")?;
    if unsafe { tintin_set_initial_lives(lives) } == 0 {
        return Err("Choose game default (0) or 1–9 starting lives.".into());
    }
    Ok(())
}

#[tauri::command]
fn load_rom(app: tauri::AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected ROM bytes.".into());
    };
    load_bytes(&app, bytes)
}
#[tauri::command]
fn recent_available(app: tauri::AppHandle) -> bool {
    data_dir(&app)
        .ok()
        .map(|d| d.join("last-rom.gbc").is_file())
        .unwrap_or(false)
}
#[tauri::command]
fn load_recent(app: tauri::AppHandle) -> Result<String, String> {
    let bytes = std::fs::read(data_dir(&app)?.join("last-rom.gbc"))
        .map_err(|_| "The last ROM is unavailable. Please choose it again.")?;
    load_bytes(&app, &bytes)
}
#[tauri::command]
async fn tick(buttons: u8) -> Result<Response, String> {
    let loaded = CORE.lock().map_err(|_| "Game state unavailable")?;
    if !*loaded {
        return Err("Choose a ROM first.".into());
    }
    let mut packet = vec![0u8; PACKET_MAX];
    let length = unsafe { tt_tick(buttons, packet.as_mut_ptr(), packet.len()) };
    if length < 8 || length > packet.len() {
        return Err("The game could not produce a frame.".into());
    }
    packet.truncate(length);
    if unsafe { tt_sprites_active() } != 0 {
        packet.resize(length + HD_BYTES, 0);
        if unsafe { tt_hd_frame(packet[length..].as_mut_ptr(), HD_BYTES) } != HD_BYTES {
            return Err("Could not produce the replacement sprite frame.".into());
        }
    }
    Ok(Response::new(packet))
}
fn read_sprite_pack(path: &Path) -> Result<Vec<u8>, String> {
    if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > SPRITE_MAX as u64 {
        return Err("Sprite pack is too large.".into());
    }
    std::fs::read(path).map_err(|e| e.to_string())
}
#[tauri::command]
fn sprite_pack_active() -> Result<bool, String> {
    let _guard = CORE.lock().map_err(|_| "Game state unavailable")?;
    Ok(unsafe { tt_sprites_active() } != 0)
}
#[tauri::command]
fn load_sprite_pack(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected sprite bytes.".into());
    };
    let _guard = CORE.lock().map_err(|_| "Game state unavailable")?;
    let dir = data_dir(&app)?;
    let path = dir.join("sprites.pack");
    let previous = read_sprite_pack(&path).ok();
    if bytes.len() > SPRITE_MAX || unsafe { tt_sprites_load(bytes.as_ptr(), bytes.len()) } == 0 {
        return Err("Invalid sprite pack. The previous pack is unchanged.".into());
    }
    let pending = dir.join("sprites.pending");
    if let Err(error) = saves::stage(&pending, bytes)
        .and_then(|_| std::fs::rename(&pending, &path).map_err(|e| e.to_string()))
    {
        unsafe {
            tt_sprites_clear();
            if let Some(old) = previous {
                tt_sprites_load(old.as_ptr(), old.len());
            }
        }
        return Err(format!("Could not remember the sprite pack: {error}"));
    }
    Ok(())
}
#[tauri::command]
fn clear_sprite_pack(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = CORE.lock().map_err(|_| "Game state unavailable")?;
    let path = data_dir(&app)?.join("sprites.pack");
    match std::fs::remove_file(path) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()),
    }
    unsafe {
        tt_sprites_clear();
    }
    Ok(())
}
#[tauri::command]
fn save_game(app: tauri::AppHandle, automatic: bool) -> Result<(), String> {
    if automatic {
        return autosave(&app);
    }
    let loaded = CORE.lock().map_err(|_| "Game state unavailable")?;
    if !*loaded {
        return Err("Open a ROM first.".into());
    }
    save_to(&data_dir(&app)?.join("quick.state"))
}
#[tauri::command]
fn restore_game(app: tauri::AppHandle) -> Result<String, String> {
    let loaded = CORE.lock().map_err(|_| "Game state unavailable")?;
    if !*loaded {
        return Err("Open a ROM first.".into());
    }
    restore_manual(&data_dir(&app)?)
}
fn restore_manual(dir: &Path) -> Result<String, String> {
    let path = dir.join("quick.state");
    for candidate in [&path, &saves::backup(&path)] {
        if candidate.is_file() && restore_from(candidate).is_ok() {
            return Ok(if candidate == &path {
                String::new()
            } else {
                "Recovered the previous manual save.".into()
            });
        }
    }
    Err("No valid manual save is available. Current progress is unchanged.".into())
}

#[tauri::command]
fn export_save(app: tauri::AppHandle) -> Result<Response, String> {
    let loaded = CORE.lock().map_err(|_| "Game state unavailable")?;
    if !*loaded {
        return Err("Open a ROM first.".into());
    }
    Ok(Response::new(capture(&data_dir(&app)?)?))
}
fn import_bytes(dir: &Path, bytes: &[u8]) -> Result<(), String> {
    saves::decode(bytes)?; // Imports always require an integrity-checked envelope.
    validate_state(dir, bytes)?; // Separate context; current progress is untouched.
    save_to(&dir.join("auto.state"))?; // Preserve current progress before the import.
    commit_state(&dir.join("quick.state"), bytes)?;
    restore_from(&dir.join("quick.state"))
}
#[tauri::command]
fn import_save(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected save bytes.".into());
    };
    let loaded = CORE.lock().map_err(|_| "Game state unavailable")?;
    if !*loaded {
        return Err("Open a ROM first.".into());
    }
    import_bytes(&data_dir(&app)?, bytes)
}
#[tauri::command]
fn unload_rom(app: tauri::AppHandle) -> Result<(), String> {
    let mut loaded = CORE.lock().map_err(|_| "Game state unavailable")?;
    if *loaded {
        save_to(&data_dir(&app)?.join("auto.state"))?;
    }
    unsafe {
        tt_close();
    }
    *loaded = false;
    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let _guard = CORE.lock().map_err(|_| "Game state unavailable")?;
            if let Ok(dir) = data_dir(app.handle()) {
                if let Ok(bytes) = read_sprite_pack(&dir.join("sprites.pack")) {
                    unsafe {
                        tt_sprites_load(bytes.as_ptr(), bytes.len());
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sprite_pack_active,
            load_sprite_pack,
            clear_sprite_pack,
            set_starting_lives,
            load_rom,
            load_recent,
            recent_available,
            tick,
            save_game,
            restore_game,
            export_save,
            import_save,
            unload_rom
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if let Err(error) = autosave(window.app_handle()) {
                    api.prevent_close();
                    let _ = window.emit("save-error", error);
                }
            }
            #[cfg(mobile)]
            tauri::WindowEvent::Suspended => {
                if let Err(error) = autosave(window.app_handle()) {
                    let _ = window.emit("save-error", error);
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("Could not start Tintin Player")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if let Err(error) = autosave(app) {
                    api.prevent_exit();
                    let _ = app.emit("save-error", error);
                }
            }
        });
}
#[cfg(test)]
mod tests;
