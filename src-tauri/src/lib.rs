// esp-studio — Tauri entry point. All real work lives in commands.rs.
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
            commands::detect_device,
            commands::bundled_versions,
            commands::override_versions,
            commands::device_delete,
            commands::upload_project,
            commands::flash_firmware,
            commands::new_project,
        ])
        .setup(|_app| {
            // macOS gets a native app menu; its "About ESPStudio" item opens our
            // own rich modal (via an event) instead of the limited system panel.
            // Windows/Linux deliberately get no window menu — About lives in
            // Settings there, so we keep the single custom toolbar uncluttered.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
                use tauri::Emitter;

                let app = _app.handle();
                let about = MenuItemBuilder::with_id("about", "About ESPStudio").build(app)?;
                let app_menu = SubmenuBuilder::new(app, "ESPStudio")
                    .item(&about)
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let menu = MenuBuilder::new(app).items(&[&app_menu, &edit_menu]).build()?;
                app.set_menu(menu)?;
                app.on_menu_event(move |app, event| {
                    if event.id().as_ref() == "about" {
                        let _ = app.emit("open-about", ());
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
