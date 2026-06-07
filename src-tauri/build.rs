fn main() {
    // Expose the build target triple at runtime so we can locate dev sidecars
    // in src-tauri/binaries/<name>-<triple> (see commands::tool_path).
    if let Ok(target) = std::env::var("TARGET") {
        println!("cargo:rustc-env=BUILD_TARGET_TRIPLE={target}");
    }
    tauri_build::build()
}
