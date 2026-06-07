// esp-studio — Tauri entry point. All real work lives in commands.rs.
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_dir,
            commands::read_file,
            commands::write_file,
            commands::list_ports,
            commands::device_tree,
            commands::device_read,
            commands::upload_file,
            commands::run_file,
            commands::reset_device,
            commands::device_delete,
            commands::upload_project,
            commands::flash_firmware,
            commands::new_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
