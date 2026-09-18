use std::{env, fs, path::PathBuf};
fn main() {
    tauri_build::build();
    let root = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let generated = root.join("../../generated/tintin");
    let runtime = generated.join("runtime");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let source = fs::read_to_string(generated.join("tintin.c"))
        .expect("Generate the Tintin C core first: run make generate in the repository root");
    // Exclude the generated ROM loader and its embedded-ROM references. The bridge
    // initializes the same configuration using user-selected, hash-verified bytes.
    let start = source
        .find("/* Extern reference to ROM data */")
        .expect("Pinned generator layout changed");
    let config = source
        .find("const GBConfig* tintin_default_config")
        .unwrap();
    let init = source.find("void tintin_init(").unwrap();
    let run = source.find("void tintin_run(").unwrap();
    let adapted = format!(
        "{}{}{}",
        &source[..start],
        &source[config..init],
        &source[run..]
    );
    let adapter = out.join("tintin_host.c");
    fs::write(&adapter, adapted).unwrap();
    let mut build = cc::Build::new();
    build
        .include(&generated)
        .include(runtime.join("include"))
        .include("native")
        .file(adapter)
        .file("native/bridge.c")
        .std("c11")
        .opt_level_str(if env::var("PROFILE").as_deref() == Ok("release") {
            "s"
        } else {
            "1"
        })
        .debug(false)
        .warnings(false);
    if env::var_os("CARGO_FEATURE_ASSET_CAPTURE").is_some() {
        build.define("TT_ASSET_CAPTURE", None);
    }
    for name in [
        "gbrt",
        "gbrt_data_mod",
        "gbrt_hash",
        "gbrt_host_configuration",
        "gbrt_port",
        "gbrt_presentation",
        "gbrt_semantic",
        "ppu",
        "audio",
        "audio_stats",
        "interpreter",
    ] {
        build.file(runtime.join(format!("src/{name}.c")));
    }
    let mut chunks: Vec<_> = fs::read_dir(&generated)
        .unwrap()
        .map(|p| p.unwrap().path())
        .filter(|p| {
            let name = p.file_name().unwrap().to_string_lossy();
            name.ends_with(".c")
                && (name.starts_with("tintin_funcs_") || name.starts_with("tintin_dispatch_chunk_"))
        })
        .collect();
    chunks.sort();
    assert!(!chunks.is_empty(), "Generated code is missing");
    build.files(chunks).compile("tintin_core");
    println!("cargo:rustc-link-lib=m");
    println!("cargo:rerun-if-changed={}", generated.display());
    println!("cargo:rerun-if-changed=native");
}
