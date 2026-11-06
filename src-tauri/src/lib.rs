pub mod cancel;
pub mod fountain;
pub mod fs_ops;
pub mod git;
pub mod menu;
pub mod search;
pub mod settings;
pub mod templates;
pub mod watcher;

use fs_ops::{FileTreeNode, OpenedFolder};
use menu::{MenuContext, MenuUiState};
use settings::{AppSettings, RecentProject};
use tauri::Emitter;
use tauri_plugin_opener::OpenerExt;

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
fn export_fountain_pdf(
    app: tauri::AppHandle,
    root: String,
    rel_path: String,
    content: String,
) -> Result<String, String> {
    let output = fountain::export_to_project(&root, &rel_path, &content)?;
    app.opener()
        .open_path(&output, None::<&str>)
        .map_err(|e| format!("PDF guardado en {} pero no se pudo abrir: {}", output, e))?;
    Ok(output)
}

#[tauri::command]
fn search_in_folder(
    root: String,
    query: String,
    max_results: usize,
    include_config: bool,
) -> Result<Vec<search::SearchMatch>, String> {
    search::search_in_folder(&root, &query, max_results, include_config)
}

#[tauri::command]
fn list_templates() -> Result<Vec<templates::TemplateInfo>, String> {
    templates::list_templates()
}

#[tauri::command]
fn create_project_from_template(
    template_id: String,
    name: String,
    destination: String,
) -> Result<templates::CreatedProject, String> {
    templates::create_project_from_template(&template_id, &name, &destination)
}

#[tauri::command]
fn save_current_as_template(
    folder_path: String,
    name: String,
) -> Result<templates::TemplateInfo, String> {
    templates::save_folder_as_template(&folder_path, &name)
}

#[tauri::command]
fn open_templates_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = templates::user_templates_dir()?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("No se pudo abrir la carpeta de plantillas: {}", e))
}

#[tauri::command]
fn start_watching(
    app: tauri::AppHandle,
    state: tauri::State<watcher::WatcherState>,
    root: String,
) -> Result<(), String> {
    let app = app.clone();
    let service = watcher::WatcherService::start(&root, move |event| {
        let _ = app.emit(watcher::FS_CHANGE_EVENT, event);
    })?;
    let mut slot = state
        .0
        .lock()
        .map_err(|_| "No se pudo bloquear el watcher".to_string())?;
    *slot = Some(service);
    Ok(())
}

#[tauri::command]
fn stop_watching(state: tauri::State<watcher::WatcherState>) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|_| "No se pudo bloquear el watcher".to_string())?
        .take();
    Ok(())
}

#[tauri::command]
fn git_status(root: String) -> Result<git::api::GitStatus, String> {
    git::api::status(&root)
}

#[tauri::command]
fn git_init(root: String) -> Result<git::api::GitStatus, String> {
    git::api::init(&root)
}

#[tauri::command]
fn git_diff_file(root: String, rel_path: String) -> Result<String, String> {
    git::api::diff_file(&root, &rel_path)
}

#[tauri::command]
fn git_restore_file(root: String, rel_path: String) -> Result<git::api::GitStatus, String> {
    git::api::restore_file(&root, &rel_path)
}

#[tauri::command]
fn git_head_file(root: String, rel_path: String) -> Result<Option<String>, String> {
    git::api::head_file(&root, &rel_path)
}

#[tauri::command]
fn git_discard_file(root: String, rel_path: String) -> Result<git::api::DiscardResult, String> {
    git::api::discard_file(&root, &rel_path)
}

#[tauri::command]
fn git_save_version(
    root: String,
    message: String,
    author_name: String,
    author_email: String,
) -> Result<git::api::GitStatus, String> {
    git::api::save_version(&root, &message, &author_name, &author_email)
}

#[tauri::command]
fn git_history(root: String, limit: usize) -> Result<Vec<git::api::GitCommit>, String> {
    git::api::history(&root, limit)
}

#[tauri::command]
fn git_commit_files(
    root: String,
    commit_id: String,
) -> Result<Vec<git::api::GitCommitFile>, String> {
    git::api::commit_files(&root, &commit_id)
}

#[tauri::command]
fn git_restore_from_commit(
    root: String,
    commit_id: String,
    rel_path: String,
) -> Result<git::api::GitStatus, String> {
    git::api::restore_from_commit(&root, &commit_id, &rel_path)
}

#[tauri::command]
fn git_branches(root: String) -> Result<Vec<git::api::GitBranch>, String> {
    git::api::branches(&root)
}

#[tauri::command]
fn git_create_branch(root: String, name: String) -> Result<git::api::GitStatus, String> {
    git::api::create_branch(&root, &name)
}

#[tauri::command]
fn git_checkout_branch(root: String, name: String) -> Result<git::api::GitStatus, String> {
    git::api::checkout_branch(&root, &name)
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
        .manage(watcher::WatcherState::default())
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
            export_fountain_pdf,
            search_in_folder,
            list_templates,
            create_project_from_template,
            save_current_as_template,
            open_templates_folder,
            start_watching,
            stop_watching,
            git_status,
            git_init,
            git_diff_file,
            git_restore_file,
            git_head_file,
            git_discard_file,
            git_save_version,
            git_history,
            git_commit_files,
            git_restore_from_commit,
            git_branches,
            git_create_branch,
            git_checkout_branch,
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
