pub mod fs_ops;
pub mod menu;
pub mod settings;

use fs_ops::{FileTreeNode, OpenedFolder};
use menu::{MenuContext, MenuUiState};
use settings::{AppSettings, RecentProject};

#[tauri::command]
fn load_settings() -> Result<AppSettings, String> {
    settings::load_settings()
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<AppSettings, String> {
    settings::save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
fn list_recent_projects() -> Result<Vec<RecentProject>, String> {
    settings::list_recent_projects()
}

#[tauri::command]
fn remove_recent_project(path: String) -> Result<Vec<RecentProject>, String> {
    settings::remove_recent_project(&path)
}

#[tauri::command]
fn refresh_menu(app: tauri::AppHandle, state: MenuUiState) -> Result<(), String> {
    let native_menu = menu::build_menu(&app, &state).map_err(|err| err.to_string())?;
    app.set_menu(native_menu).map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_folder(path: String, show_config: bool) -> Result<OpenedFolder, String> {
    let opened = fs_ops::open_folder(&path, show_config)?;
    let _ = settings::record_recent_project(&opened.root_path, &opened.name);
    Ok(opened)
}

#[tauri::command]
fn list_directory_tree(root: String, show_config: bool) -> Result<Vec<FileTreeNode>, String> {
    fs_ops::list_directory_tree(&root, show_config)
}

#[tauri::command]
fn read_text_file(root: String, rel_path: String) -> Result<String, String> {
    fs_ops::read_text_file(&root, &rel_path)
}

#[tauri::command]
fn write_text_file(root: String, rel_path: String, content: String) -> Result<(), String> {
    fs_ops::write_text_file(&root, &rel_path, &content)
}

#[tauri::command]
fn create_entry(root: String, rel_path: String, is_dir: bool) -> Result<(), String> {
    fs_ops::create_entry(&root, &rel_path, is_dir)
}

#[tauri::command]
fn rename_entry(root: String, old_rel_path: String, new_rel_path: String) -> Result<(), String> {
    fs_ops::rename_entry(&root, &old_rel_path, &new_rel_path)
}

#[tauri::command]
fn delete_entry(root: String, rel_path: String) -> Result<(), String> {
    fs_ops::delete_entry(&root, &rel_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(MenuContext::default())
        .setup(|app| {
            let settings = settings::load_settings().unwrap_or_default();
            let state = MenuUiState {
                language: settings.language,
                word_wrap: settings.word_wrap,
                line_numbers: settings.line_numbers,
                ..Default::default()
            };
            let native_menu = menu::build_menu(app.handle(), &state)?;
            app.set_menu(native_menu)?;
            #[cfg(target_os = "macos")]
            menu::install_shortcut_monitor(app.handle());
            Ok(())
        })
        .on_menu_event(menu::handle_menu_event)
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            list_recent_projects,
            remove_recent_project,
            refresh_menu,
            open_folder,
            list_directory_tree,
            read_text_file,
            write_text_file,
            create_entry,
            rename_entry,
            delete_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running bradbit-editor");
}
