pub mod cancel;
pub mod fountain;
pub mod fs_ops;
pub mod git;
pub mod github;
pub mod kit;
pub mod menu;
pub mod opencode;
pub mod pty;
pub mod search;
pub mod settings;
pub mod templates;
pub mod watcher;
pub mod workspace_state;

use fs_ops::{FileTreeNode, OpenedFolder};
use menu::{MenuContext, MenuUiState};
use settings::{AppSettings, RecentProject};
use tauri::{Emitter, Manager};
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

fn session_github_token(
    state: &tauri::State<github::secrets::GitHubSecrets>,
) -> Result<Option<String>, String> {
    let token = state.token().map_err(|err| err.to_string())?;
    if let Some(value) = &token {
        github::secrets::validate_github_token(value).map_err(|err| err.to_string())?;
    }
    Ok(token)
}

#[tauri::command]
fn git_remotes(root: String) -> Result<Vec<git::api::GitRemote>, String> {
    git::api::remotes(&root)
}

#[tauri::command]
fn git_add_remote(
    root: String,
    name: String,
    url: String,
) -> Result<Vec<git::api::GitRemote>, String> {
    git::api::add_remote(&root, &name, &url)
}

#[tauri::command]
fn git_fetch(root: String, remote: String) -> Result<git::api::GitStatus, String> {
    git::api::fetch(&root, &remote)
}

#[tauri::command]
fn git_push(
    root: String,
    remote: String,
    branch: String,
    state: tauri::State<github::secrets::GitHubSecrets>,
) -> Result<git::api::GitStatus, String> {
    let token = session_github_token(&state)?;
    git::api::push(&root, &remote, &branch, token.as_deref())
}

#[tauri::command]
fn git_pull(
    root: String,
    remote: String,
    branch: String,
    state: tauri::State<github::secrets::GitHubSecrets>,
) -> Result<git::api::GitStatus, String> {
    let token = session_github_token(&state)?;
    git::api::pull(&root, &remote, &branch, token.as_deref())
}

#[tauri::command]
fn github_set_token(
    token: String,
    state: tauri::State<github::secrets::GitHubSecrets>,
) -> Result<(), String> {
    state.save(&token).map_err(|err| err.to_string())
}

#[tauri::command]
fn github_clear_token(state: tauri::State<github::secrets::GitHubSecrets>) -> Result<(), String> {
    state.clear().map_err(|err| err.to_string())
}

#[tauri::command]
fn github_token_status(
    state: tauri::State<github::secrets::GitHubSecrets>,
) -> Result<bool, String> {
    state.has_token().map_err(|err| err.to_string())
}

fn github_client(
    state: &tauri::State<github::secrets::GitHubSecrets>,
) -> Result<github::GitHubClient, String> {
    let token = state
        .token()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Conecta tu cuenta de GitHub en Ajustes".to_string())?;
    github::secrets::validate_github_token(&token).map_err(|err| err.to_string())?;
    let mut config = github::GitHubConfig::github_com(token);
    // Debug-only override so the full UI can be exercised against a local
    // mock GitHub server. Release builds always talk to api.github.com.
    #[cfg(debug_assertions)]
    if let Ok(base) = std::env::var("BRADBIT_GITHUB_API_BASE_URL") {
        let base = base.trim();
        if !base.is_empty() {
            config = config.with_base_url(base);
        }
    }
    Ok(github::GitHubClient::new(config))
}

#[tauri::command]
fn github_verify_account(
    state: tauri::State<github::secrets::GitHubSecrets>,
) -> Result<github::User, String> {
    github_client(&state)?
        .authenticated_user()
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn github_get_repository(
    state: tauri::State<github::secrets::GitHubSecrets>,
    owner: String,
    repo: String,
) -> Result<github::Repository, String> {
    github_client(&state)?
        .get_repository(&owner, &repo)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn github_create_repository(
    state: tauri::State<github::secrets::GitHubSecrets>,
    name: String,
    is_private: bool,
    description: Option<String>,
) -> Result<github::Repository, String> {
    let mut input = github::NewRepository::new(name);
    if is_private {
        input = input.private();
    }
    input.description = description;
    github_client(&state)?
        .create_repository(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn github_list_branches(
    state: tauri::State<github::secrets::GitHubSecrets>,
    owner: String,
    repo: String,
    max_pages: usize,
) -> Result<Vec<github::Branch>, String> {
    github_client(&state)?
        .list_branches(&owner, &repo, max_pages)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn github_list_pull_requests(
    state: tauri::State<github::secrets::GitHubSecrets>,
    owner: String,
    repo: String,
    pr_state: String,
    max_pages: usize,
) -> Result<Vec<github::PullRequest>, String> {
    github_client(&state)?
        .list_pull_requests(&owner, &repo, &pr_state, max_pages)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn github_create_pull_request(
    state: tauri::State<github::secrets::GitHubSecrets>,
    owner: String,
    repo: String,
    title: String,
    head: String,
    base: String,
    body: Option<String>,
) -> Result<github::PullRequest, String> {
    let input = github::NewPullRequest {
        title,
        head,
        base,
        body,
    };
    github_client(&state)?
        .create_pull_request(&owner, &repo, &input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn opencode_start(
    app: tauri::AppHandle,
    root: String,
    state: tauri::State<opencode::OpenCodeState>,
) -> Result<(), String> {
    state.start(&app, &root)
}

#[tauri::command]
fn opencode_stop(state: tauri::State<opencode::OpenCodeState>) -> Result<(), String> {
    state.stop();
    Ok(())
}

#[tauri::command]
fn opencode_send(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
    text: String,
) -> Result<(), String> {
    state.send(&session_id, &text)
}

#[tauri::command]
fn opencode_abort(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
) -> Result<bool, String> {
    state.abort(&session_id)
}

#[tauri::command]
fn pty_start(
    app: tauri::AppHandle,
    state: tauri::State<pty::PtyState>,
    root: String,
    command: String,
    cols: u16,
    rows: u16,
) -> Result<pty::PtyStartResult, String> {
    let id = state.next_id();
    let output_app = app.clone();
    let output_id = id.clone();
    let exit_app = app.clone();
    let exit_id = id.clone();
    state.start(
        pty::PtyStartOptions {
            id,
            root,
            command,
            cols,
            rows,
        },
        move |data| {
            let _ = output_app.emit(
                pty::OUTPUT_EVENT,
                pty::PtyOutputEvent {
                    id: output_id.clone(),
                    data,
                },
            );
        },
        move |code| {
            let _ = exit_app.emit(
                pty::EXIT_EVENT,
                pty::PtyExitEvent {
                    id: exit_id.clone(),
                    code,
                },
            );
        },
    )
}

#[tauri::command]
fn pty_write(state: tauri::State<pty::PtyState>, id: String, data: String) -> Result<(), String> {
    state.write(&id, &data)
}

#[tauri::command]
fn pty_resize(
    state: tauri::State<pty::PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.resize(&id, cols, rows)
}

#[tauri::command]
fn pty_stop(state: tauri::State<pty::PtyState>) -> Result<(), String> {
    state.stop();
    Ok(())
}

#[tauri::command]
fn pty_status(state: tauri::State<pty::PtyState>) -> pty::PtyStatus {
    state.status()
}

#[tauri::command]
fn opencode_status(state: tauri::State<opencode::OpenCodeState>) -> opencode::OpenCodeStatus {
    state.status()
}

#[tauri::command]
fn opencode_list_sessions(
    state: tauri::State<opencode::OpenCodeState>,
) -> Result<Vec<opencode::OpenCodeSession>, String> {
    state.list_sessions()
}

#[tauri::command]
fn opencode_create_session(
    state: tauri::State<opencode::OpenCodeState>,
    title: String,
) -> Result<opencode::OpenCodeSession, String> {
    state.create_session(&title)
}

#[tauri::command]
fn opencode_session_messages(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
) -> Result<Vec<opencode::OpenCodeChatMessage>, String> {
    state.session_messages(&session_id)
}

#[tauri::command]
fn opencode_pending_permissions(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
) -> Result<Vec<opencode::OpenCodePermission>, String> {
    state.pending_permissions(&session_id)
}

#[tauri::command]
fn opencode_reply_permission(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
    request_id: String,
    decision: String,
) -> Result<(), String> {
    state.reply_permission(&session_id, &request_id, &decision)
}

#[tauri::command]
fn opencode_pending_forms(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
) -> Result<Vec<opencode::OpenCodeForm>, String> {
    state.pending_forms(&session_id)
}

#[tauri::command]
fn opencode_list_models(
    state: tauri::State<opencode::OpenCodeState>,
) -> Result<Vec<opencode::OpenCodeModel>, String> {
    state.models()
}

#[tauri::command]
fn opencode_switch_agent(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
    agent: String,
) -> Result<(), String> {
    state.switch_agent(&session_id, &agent)
}

#[tauri::command]
fn opencode_switch_model(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
    provider_id: String,
    model_id: String,
    variant: Option<String>,
) -> Result<(), String> {
    state.switch_model(&session_id, &provider_id, &model_id, variant.as_deref())
}

#[tauri::command]
fn opencode_run_command(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
    name: String,
    text: String,
) -> Result<(), String> {
    state.run_command(&session_id, &name, &text)
}

#[tauri::command]
fn opencode_reply_form(
    state: tauri::State<opencode::OpenCodeState>,
    session_id: String,
    form_id: String,
    answer: serde_json::Value,
) -> Result<(), String> {
    state.reply_form(&session_id, &form_id, &answer)
}

#[tauri::command]
fn load_workspace_state(root: String) -> Result<workspace_state::ProjectWorkspaceState, String> {
    workspace_state::load(&root)
}

#[tauri::command]
fn save_workspace_state(
    root: String,
    state: workspace_state::ProjectWorkspaceState,
) -> Result<(), String> {
    workspace_state::save(&root, &state)
}

#[tauri::command]
fn discover_kit(root: String) -> Result<kit::KitCatalog, String> {
    kit::discover(&root)
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
        .manage(github::secrets::GitHubSecrets::new())
        .manage(opencode::OpenCodeState::default())
        .manage(pty::PtyState::default())
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
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.try_state::<opencode::OpenCodeState>() {
                    state.stop();
                }
            }
        })
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
            git_remotes,
            git_add_remote,
            git_fetch,
            git_push,
            git_pull,
            github_set_token,
            github_clear_token,
            github_token_status,
            github_verify_account,
            github_get_repository,
            github_create_repository,
            github_list_branches,
            github_list_pull_requests,
            github_create_pull_request,
            opencode_start,
            opencode_stop,
            opencode_send,
            opencode_abort,
            opencode_status,
            opencode_list_sessions,
            opencode_create_session,
            opencode_session_messages,
            opencode_pending_permissions,
            opencode_reply_permission,
            opencode_pending_forms,
            opencode_reply_form,
            opencode_list_models,
            opencode_switch_agent,
            opencode_switch_model,
            opencode_run_command,
            pty_start,
            pty_write,
            pty_resize,
            pty_stop,
            pty_status,
            load_workspace_state,
            save_workspace_state,
            open_folder,
            discover_kit,
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
