use crate::settings;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::menu::{
    AboutMetadata, CheckMenuItemBuilder, MenuBuilder, MenuEvent, MenuItemBuilder,
    PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const MENU_EVENT: &str = "bradbit-menu";

/// Snapshot of the UI state needed to keep the native menu in sync.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MenuUiState {
    pub language: String,
    pub has_folder: bool,
    pub has_active_tab: bool,
    pub is_markdown: bool,
    pub is_fountain: bool,
    pub preview_mode: bool,
    pub sidebar_visible: bool,
    pub word_wrap: bool,
    pub line_numbers: bool,
}

impl Default for MenuUiState {
    fn default() -> Self {
        Self {
            language: "es".to_string(),
            has_folder: false,
            has_active_tab: false,
            is_markdown: false,
            is_fountain: false,
            preview_mode: false,
            sidebar_visible: true,
            word_wrap: true,
            line_numbers: false,
        }
    }
}

/// Event payload sent to the frontend when a native menu item is activated.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MenuCommand {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// Keeps the mapping from `file.recent.<index>` menu ids to real paths and the
/// latest UI state, so keyboard shortcuts can honor disabled menu items.
#[derive(Default)]
pub struct MenuContext {
    recent_paths: Mutex<Vec<String>>,
    ui_state: Mutex<Option<MenuUiState>>,
}

/// Labels for the native menu. Tauri does not localize custom items automatically.
struct MenuLabels {
    about: &'static str,
    settings: &'static str,
    services: &'static str,
    hide: &'static str,
    hide_others: &'static str,
    show_all: &'static str,
    quit: &'static str,
    file: &'static str,
    open_folder: &'static str,
    open_recent: &'static str,
    new_project: &'static str,
    save_as_template: &'static str,
    open_templates_folder: &'static str,
    new_file: &'static str,
    save: &'static str,
    export_pdf: &'static str,
    quick_open: &'static str,
    close_tab: &'static str,
    edit: &'static str,
    undo: &'static str,
    redo: &'static str,
    cut: &'static str,
    copy: &'static str,
    paste: &'static str,
    select_all: &'static str,
    bold: &'static str,
    italic: &'static str,
    find: &'static str,
    find_replace: &'static str,
    find_in_project: &'static str,
    view: &'static str,
    toggle_sidebar: &'static str,
    preview: &'static str,
    word_wrap: &'static str,
    line_numbers: &'static str,
    fullscreen: &'static str,
    window: &'static str,
    minimize: &'static str,
    zoom: &'static str,
    bring_all_to_front: &'static str,
}

impl MenuLabels {
    fn for_language(language: &str) -> Self {
        if language == "en" {
            Self {
                about: "About Bradbit Editor",
                settings: "Settings…",
                services: "Services",
                hide: "Hide Bradbit Editor",
                hide_others: "Hide Others",
                show_all: "Show All",
                quit: "Quit Bradbit Editor",
                file: "File",
                open_folder: "Open Folder…",
                open_recent: "Open Recent",
                new_project: "New Project…",
                save_as_template: "Save as Template…",
                open_templates_folder: "Open Templates Folder",
                new_file: "New File",
                save: "Save",
                export_pdf: "Export PDF…",
                quick_open: "Quick Open…",
                close_tab: "Close Tab",
                edit: "Edit",
                undo: "Undo",
                redo: "Redo",
                cut: "Cut",
                copy: "Copy",
                paste: "Paste",
                select_all: "Select All",
                bold: "Bold",
                italic: "Italic",
                find: "Find…",
                find_replace: "Find and Replace…",
                find_in_project: "Find in Project…",
                view: "View",
                toggle_sidebar: "Toggle Explorer",
                preview: "Preview",
                word_wrap: "Word Wrap",
                line_numbers: "Line Numbers",
                fullscreen: "Enter Full Screen",
                window: "Window",
                minimize: "Minimize",
                zoom: "Zoom",
                bring_all_to_front: "Bring All to Front",
            }
        } else {
            Self {
                about: "Acerca de Bradbit Editor",
                settings: "Ajustes…",
                services: "Servicios",
                hide: "Ocultar Bradbit Editor",
                hide_others: "Ocultar otros",
                show_all: "Mostrar todo",
                quit: "Salir de Bradbit Editor",
                file: "Archivo",
                open_folder: "Abrir carpeta…",
                open_recent: "Abrir reciente",
                new_project: "Nuevo proyecto…",
                save_as_template: "Guardar como plantilla…",
                open_templates_folder: "Abrir carpeta de plantillas",
                new_file: "Nuevo archivo",
                save: "Guardar",
                export_pdf: "Exportar PDF…",
                quick_open: "Apertura rápida…",
                close_tab: "Cerrar pestaña",
                edit: "Edición",
                undo: "Deshacer",
                redo: "Rehacer",
                cut: "Cortar",
                copy: "Copiar",
                paste: "Pegar",
                select_all: "Seleccionar todo",
                bold: "Negrita",
                italic: "Cursiva",
                find: "Buscar…",
                find_replace: "Buscar y reemplazar…",
                find_in_project: "Buscar en proyecto…",
                view: "Visualización",
                toggle_sidebar: "Mostrar u ocultar archivos",
                preview: "Vista previa",
                word_wrap: "Ajuste de línea",
                line_numbers: "Números de línea",
                fullscreen: "Pantalla completa",
                window: "Ventana",
                minimize: "Minimizar",
                zoom: "Zoom",
                bring_all_to_front: "Traer todo al frente",
            }
        }
    }
}

pub fn recent_menu_id(index: usize) -> String {
    format!("file.recent.{index}")
}

pub fn parse_recent_menu_id(id: &str) -> Option<usize> {
    id.strip_prefix("file.recent.")?.parse().ok()
}

pub fn is_known_command(id: &str) -> bool {
    matches!(
        id,
        "app.settings"
            | "file.openFolder"
            | "file.newProject"
            | "file.saveAsTemplate"
            | "file.openTemplatesFolder"
            | "file.newFile"
            | "file.save"
            | "file.exportPdf"
            | "file.quickOpen"
            | "file.closeTab"
            | "edit.undo"
            | "edit.redo"
            | "edit.bold"
            | "edit.italic"
            | "edit.find"
            | "edit.findReplace"
            | "edit.findInProject"
            | "view.toggleSidebar"
            | "view.togglePreview"
            | "view.wordWrap"
            | "view.lineNumbers"
    )
}

/// Whether a command should run for the current UI state. Mirrors the
/// enabled/disabled state of the corresponding native menu item.
pub fn command_enabled(state: &MenuUiState, id: &str) -> bool {
    match id {
        "app.settings" | "file.openFolder" => true,
        "file.newProject" | "file.openTemplatesFolder" => true,
        "file.saveAsTemplate" => state.has_folder,
        "file.newFile" | "file.quickOpen" | "edit.findInProject" | "view.toggleSidebar" => {
            state.has_folder
        }
        "file.save" | "file.closeTab" | "edit.undo" | "edit.redo" | "edit.find"
        | "edit.findReplace" => state.has_active_tab,
        "file.exportPdf" => state.has_active_tab && state.is_fountain,
        "edit.bold" | "edit.italic" | "view.togglePreview" => {
            state.has_active_tab && state.is_markdown
        }
        "view.wordWrap" | "view.lineNumbers" => true,
        _ => false,
    }
}

/// Maps a macOS key equivalent (ignoring the Command modifier) to a native
/// menu command. Kept pure so the shortcut contract is unit-testable.
pub fn shortcut_command(key: &str, shift: bool, option: bool) -> Option<&'static str> {
    match (key, shift, option) {
        ("z", false, false) => Some("edit.undo"),
        ("z", true, false) => Some("edit.redo"),
        ("b", false, false) => Some("edit.bold"),
        ("i", false, false) => Some("edit.italic"),
        ("f", false, false) => Some("edit.find"),
        ("f", true, false) => Some("edit.findInProject"),
        ("f", false, true) => Some("edit.findReplace"),
        ("p", false, false) => Some("file.quickOpen"),
        ("p", false, true) => Some("view.togglePreview"),
        ("e", true, false) => Some("view.toggleSidebar"),
        ("s", false, false) => Some("file.save"),
        ("e", false, false) => Some("file.exportPdf"),
        ("o", false, false) => Some("file.openFolder"),
        ("n", false, false) => Some("file.newFile"),
        ("n", true, false) => Some("file.newProject"),
        ("w", false, false) => Some("file.closeTab"),
        (",", false, false) => Some("app.settings"),
        _ => None,
    }
}

/// Builds the whole native menu for the current application state.
pub fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    state: &MenuUiState,
) -> tauri::Result<tauri::menu::Menu<R>> {
    let labels = MenuLabels::for_language(&state.language);
    let recents = settings::list_recent_projects().unwrap_or_default();

    if let Ok(mut paths) = app.state::<MenuContext>().recent_paths.lock() {
        *paths = recents.iter().map(|project| project.path.clone()).collect();
    }
    if let Ok(mut current) = app.state::<MenuContext>().ui_state.lock() {
        *current = Some(state.clone());
    }

    let mut menu = MenuBuilder::new(app);

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "Bradbit Editor")
            .about_with_text(
                labels.about,
                Some(AboutMetadata {
                    name: Some("Bradbit Editor".to_string()),
                    version: Some(env!("CARGO_PKG_VERSION").to_string()),
                    copyright: Some("© 2026 Bradbit".to_string()),
                    ..Default::default()
                }),
            )
            .separator()
            .item(
                &MenuItemBuilder::new(labels.settings)
                    .id("app.settings")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?,
            )
            .separator()
            .services_with_text(labels.services)
            .separator()
            .hide_with_text(labels.hide)
            .hide_others_with_text(labels.hide_others)
            .show_all_with_text(labels.show_all)
            .separator()
            .quit_with_text(labels.quit)
            .build()?;
        menu = menu.item(&app_menu);
    }

    let open_folder = MenuItemBuilder::new(labels.open_folder)
        .id("file.openFolder")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let new_project = MenuItemBuilder::new(labels.new_project)
        .id("file.newProject")
        .accelerator("Shift+CmdOrCtrl+N")
        .build(app)?;
    let save_as_template = MenuItemBuilder::new(labels.save_as_template)
        .id("file.saveAsTemplate")
        .enabled(state.has_folder)
        .build(app)?;
    let open_templates_folder = MenuItemBuilder::new(labels.open_templates_folder)
        .id("file.openTemplatesFolder")
        .build(app)?;
    let new_file = MenuItemBuilder::new(labels.new_file)
        .id("file.newFile")
        .accelerator("CmdOrCtrl+N")
        .enabled(state.has_folder)
        .build(app)?;
    let quick_open = MenuItemBuilder::new(labels.quick_open)
        .id("file.quickOpen")
        .accelerator("CmdOrCtrl+P")
        .enabled(state.has_folder)
        .build(app)?;
    let save = MenuItemBuilder::new(labels.save)
        .id("file.save")
        .accelerator("CmdOrCtrl+S")
        .enabled(state.has_active_tab)
        .build(app)?;
    let export_pdf = MenuItemBuilder::new(labels.export_pdf)
        .id("file.exportPdf")
        .accelerator("CmdOrCtrl+E")
        .enabled(state.has_active_tab && state.is_fountain)
        .build(app)?;
    let close_tab = MenuItemBuilder::new(labels.close_tab)
        .id("file.closeTab")
        .accelerator("CmdOrCtrl+W")
        .enabled(state.has_active_tab)
        .build(app)?;

    let mut file_menu = SubmenuBuilder::new(app, labels.file).item(&open_folder);
    if !recents.is_empty() {
        let mut recent_menu = SubmenuBuilder::new(app, labels.open_recent);
        for (index, project) in recents.iter().enumerate() {
            let item = MenuItemBuilder::new(project.name.as_str())
                .id(recent_menu_id(index))
                .build(app)?;
            recent_menu = recent_menu.item(&item);
        }
        let recent_submenu = recent_menu.build()?;
        file_menu = file_menu.item(&recent_submenu);
    }
    let file_menu = file_menu
        .separator()
        .item(&new_project)
        .item(&save_as_template)
        .item(&open_templates_folder)
        .separator()
        .item(&quick_open)
        .separator()
        .item(&new_file)
        .item(&save)
        .item(&export_pdf)
        .separator()
        .item(&close_tab)
        .build()?;
    menu = menu.item(&file_menu);

    let undo = MenuItemBuilder::new(labels.undo)
        .id("edit.undo")
        .accelerator("CmdOrCtrl+Z")
        .enabled(state.has_active_tab)
        .build(app)?;
    let redo = MenuItemBuilder::new(labels.redo)
        .id("edit.redo")
        .accelerator("Shift+CmdOrCtrl+Z")
        .enabled(state.has_active_tab)
        .build(app)?;
    let bold = MenuItemBuilder::new(labels.bold)
        .id("edit.bold")
        .accelerator("CmdOrCtrl+B")
        .enabled(state.has_active_tab && state.is_markdown)
        .build(app)?;
    let italic = MenuItemBuilder::new(labels.italic)
        .id("edit.italic")
        .accelerator("CmdOrCtrl+I")
        .enabled(state.has_active_tab && state.is_markdown)
        .build(app)?;
    let cut = PredefinedMenuItem::cut(app, Some(labels.cut))?;
    let copy = PredefinedMenuItem::copy(app, Some(labels.copy))?;
    let paste = PredefinedMenuItem::paste(app, Some(labels.paste))?;
    let select_all = PredefinedMenuItem::select_all(app, Some(labels.select_all))?;
    let find = MenuItemBuilder::new(labels.find)
        .id("edit.find")
        .accelerator("CmdOrCtrl+F")
        .enabled(state.has_active_tab)
        .build(app)?;
    let find_replace = MenuItemBuilder::new(labels.find_replace)
        .id("edit.findReplace")
        .accelerator("Alt+CmdOrCtrl+F")
        .enabled(state.has_active_tab)
        .build(app)?;
    let find_in_project = MenuItemBuilder::new(labels.find_in_project)
        .id("edit.findInProject")
        .accelerator("Shift+CmdOrCtrl+F")
        .enabled(state.has_folder)
        .build(app)?;

    let edit_menu = SubmenuBuilder::new(app, labels.edit)
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&bold)
        .item(&italic)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&select_all)
        .separator()
        .item(&find)
        .item(&find_replace)
        .item(&find_in_project)
        .build()?;
    menu = menu.item(&edit_menu);

    let toggle_sidebar = CheckMenuItemBuilder::new(labels.toggle_sidebar)
        .id("view.toggleSidebar")
        .accelerator("Shift+CmdOrCtrl+E")
        .checked(state.sidebar_visible)
        .enabled(state.has_folder)
        .build(app)?;
    let toggle_preview = CheckMenuItemBuilder::new(labels.preview)
        .id("view.togglePreview")
        .accelerator("Alt+CmdOrCtrl+P")
        .checked(state.has_active_tab && state.is_markdown && state.preview_mode)
        .enabled(state.has_active_tab && state.is_markdown)
        .build(app)?;
    let word_wrap = CheckMenuItemBuilder::new(labels.word_wrap)
        .id("view.wordWrap")
        .checked(state.word_wrap)
        .build(app)?;
    let line_numbers = CheckMenuItemBuilder::new(labels.line_numbers)
        .id("view.lineNumbers")
        .checked(state.line_numbers)
        .build(app)?;
    let fullscreen = PredefinedMenuItem::fullscreen(app, Some(labels.fullscreen))?;

    let view_menu = SubmenuBuilder::new(app, labels.view)
        .item(&toggle_sidebar)
        .separator()
        .item(&toggle_preview)
        .item(&word_wrap)
        .item(&line_numbers)
        .separator()
        .item(&fullscreen)
        .build()?;
    menu = menu.item(&view_menu);

    let minimize = PredefinedMenuItem::minimize(app, Some(labels.minimize))?;
    let zoom = PredefinedMenuItem::maximize(app, Some(labels.zoom))?;
    let bring_all_to_front =
        PredefinedMenuItem::bring_all_to_front(app, Some(labels.bring_all_to_front))?;

    let window_menu = SubmenuBuilder::new(app, labels.window)
        .item(&minimize)
        .item(&zoom)
        .separator()
        .item(&bring_all_to_front)
        .build()?;
    menu = menu.item(&window_menu);

    menu.build()
}

/// Installs a native keyboard monitor for the application shortcuts.
///
/// Tauri 2.12.5 on macOS does not deliver menu key equivalents to the webview
/// (the menu items work when clicked, but their accelerators never fire).
/// This monitor intercepts the same shortcuts at the AppKit level, emits the
/// usual `bradbit-menu` command and consumes the event, so the native menu is
/// still the single source of truth and no command runs twice.
#[cfg(target_os = "macos")]
pub fn install_shortcut_monitor<R: Runtime>(app: &AppHandle<R>) {
    use block2::RcBlock;
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags};
    use std::ptr::NonNull;

    let app = app.clone();
    let block = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        let event_ref = unsafe { event.as_ref() };
        let modifiers = event_ref.modifierFlags();
        if !modifiers.contains(NSEventModifierFlags::Command) {
            return event.as_ptr();
        }
        let Some(characters) = event_ref.charactersIgnoringModifiers() else {
            return event.as_ptr();
        };
        let key = characters.to_string().to_lowercase();
        let shift = modifiers.contains(NSEventModifierFlags::Shift);
        let option = modifiers.contains(NSEventModifierFlags::Option);
        let Some(id) = shortcut_command(&key, shift, option) else {
            return event.as_ptr();
        };

        let state = app
            .state::<MenuContext>()
            .ui_state
            .lock()
            .ok()
            .and_then(|state| state.clone())
            .unwrap_or_default();
        if !command_enabled(&state, id) {
            return event.as_ptr();
        }

        if !event_ref.isARepeat() {
            emit_command(&app, id, None);
        }
        std::ptr::null_mut()
    });

    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &block)
    };

    // The monitor and its block live for the whole application lifetime.
    std::mem::forget(block);
    std::mem::forget(monitor);
}

fn emit_command<R: Runtime>(app: &AppHandle<R>, id: &str, path: Option<String>) {
    let _ = app.emit(
        MENU_EVENT,
        MenuCommand {
            id: id.to_string(),
            path,
        },
    );
}

/// Routes native menu events to the frontend using a single event channel.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref().to_string();

    if let Some(index) = parse_recent_menu_id(&id) {
        let path = app
            .state::<MenuContext>()
            .recent_paths
            .lock()
            .ok()
            .and_then(|paths| paths.get(index).cloned());
        if let Some(path) = path {
            emit_command(app, "file.openRecent", Some(path));
        }
        return;
    }

    if is_known_command(&id) {
        emit_command(app, &id, None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_menu_ids_round_trip() {
        for index in [0, 1, 7, 42] {
            let id = recent_menu_id(index);
            assert_eq!(parse_recent_menu_id(&id), Some(index));
        }
        assert_eq!(parse_recent_menu_id("file.recent."), None);
        assert_eq!(parse_recent_menu_id("file.recent.abc"), None);
        assert_eq!(parse_recent_menu_id("file.save"), None);
    }

    #[test]
    fn known_commands_exclude_predefined_items() {
        assert!(is_known_command("file.save"));
        assert!(is_known_command("file.exportPdf"));
        assert!(is_known_command("file.newProject"));
        assert!(is_known_command("file.saveAsTemplate"));
        assert!(is_known_command("file.openTemplatesFolder"));
        assert!(is_known_command("file.quickOpen"));
        assert!(is_known_command("edit.findInProject"));
        assert!(is_known_command("edit.findReplace"));
        assert!(is_known_command("edit.bold"));
        assert!(is_known_command("edit.italic"));
        assert!(is_known_command("view.togglePreview"));
        assert!(is_known_command("view.lineNumbers"));
        assert!(!is_known_command("copy"));
        assert!(!is_known_command("file.recent.0"));
        assert!(!is_known_command("unknown.command"));
    }

    #[test]
    fn menu_labels_switch_between_spanish_and_english() {
        let es = MenuLabels::for_language("es");
        let en = MenuLabels::for_language("en");

        assert_eq!(es.file, "Archivo");
        assert_eq!(es.edit, "Edición");
        assert_eq!(es.view, "Visualización");
        assert_eq!(es.bold, "Negrita");
        assert_eq!(es.italic, "Cursiva");
        assert_eq!(es.preview, "Vista previa");
        assert_eq!(es.export_pdf, "Exportar PDF…");
        assert_eq!(es.quick_open, "Apertura rápida…");
        assert_eq!(es.new_project, "Nuevo proyecto…");
        assert_eq!(es.save_as_template, "Guardar como plantilla…");
        assert_eq!(es.open_templates_folder, "Abrir carpeta de plantillas");
        assert_eq!(es.find_in_project, "Buscar en proyecto…");
        assert_eq!(en.file, "File");
        assert_eq!(en.edit, "Edit");
        assert_eq!(en.view, "View");
        assert_eq!(en.bold, "Bold");
        assert_eq!(en.italic, "Italic");
        assert_eq!(en.preview, "Preview");
        assert_eq!(en.export_pdf, "Export PDF…");
        assert_eq!(en.quick_open, "Quick Open…");
        assert_eq!(en.new_project, "New Project…");
        assert_eq!(en.save_as_template, "Save as Template…");
        assert_eq!(en.open_templates_folder, "Open Templates Folder");
        assert_eq!(en.find_in_project, "Find in Project…");
    }

    #[test]
    fn default_menu_state_has_no_folder_or_active_tab() {
        let state = MenuUiState::default();
        assert_eq!(state.language, "es");
        assert!(!state.has_folder);
        assert!(!state.has_active_tab);
        assert!(!state.is_markdown);
        assert!(!state.is_fountain);
        assert!(!state.preview_mode);
        assert!(state.sidebar_visible);
    }

    #[test]
    fn command_enabled_matches_menu_state() {
        let mut state = MenuUiState::default();
        assert!(command_enabled(&state, "file.openFolder"));
        assert!(command_enabled(&state, "app.settings"));
        assert!(command_enabled(&state, "file.newProject"));
        assert!(command_enabled(&state, "file.openTemplatesFolder"));
        assert!(!command_enabled(&state, "file.saveAsTemplate"));
        assert!(!command_enabled(&state, "file.newFile"));
        assert!(!command_enabled(&state, "file.save"));
        assert!(!command_enabled(&state, "file.quickOpen"));
        assert!(!command_enabled(&state, "edit.findInProject"));
        assert!(!command_enabled(&state, "view.toggleSidebar"));
        assert!(!command_enabled(&state, "edit.bold"));
        assert!(!command_enabled(&state, "view.togglePreview"));

        state.has_folder = true;
        assert!(command_enabled(&state, "file.newFile"));
        assert!(command_enabled(&state, "file.saveAsTemplate"));
        assert!(command_enabled(&state, "file.quickOpen"));
        assert!(command_enabled(&state, "edit.findInProject"));
        assert!(command_enabled(&state, "view.toggleSidebar"));
        assert!(!command_enabled(&state, "file.save"));

        state.has_active_tab = true;
        assert!(command_enabled(&state, "file.save"));
        assert!(command_enabled(&state, "file.closeTab"));
        assert!(command_enabled(&state, "edit.find"));
        assert!(!command_enabled(&state, "file.exportPdf"));
        assert!(!command_enabled(&state, "edit.bold"));
        assert!(!command_enabled(&state, "view.togglePreview"));

        state.is_markdown = true;
        assert!(command_enabled(&state, "edit.bold"));
        assert!(command_enabled(&state, "edit.italic"));
        assert!(command_enabled(&state, "view.togglePreview"));
        assert!(!command_enabled(&state, "file.exportPdf"));

        state.is_fountain = true;
        assert!(command_enabled(&state, "file.exportPdf"));
        assert!(!command_enabled(&state, "unknown.command"));
    }

    #[test]
    fn shortcut_map_uses_markdown_and_writing_shortcuts() {
        assert_eq!(shortcut_command("b", false, false), Some("edit.bold"));
        assert_eq!(shortcut_command("i", false, false), Some("edit.italic"));
        assert_eq!(
            shortcut_command("e", true, false),
            Some("view.toggleSidebar")
        );
        assert_eq!(
            shortcut_command("p", false, true),
            Some("view.togglePreview")
        );
        assert_eq!(shortcut_command("z", false, false), Some("edit.undo"));
        assert_eq!(shortcut_command("z", true, false), Some("edit.redo"));
        assert_eq!(shortcut_command("s", false, false), Some("file.save"));
        assert_eq!(shortcut_command("n", false, false), Some("file.newFile"));
        assert_eq!(shortcut_command("n", true, false), Some("file.newProject"));
        assert_eq!(shortcut_command("e", false, false), Some("file.exportPdf"));
        assert_eq!(shortcut_command("f", false, true), Some("edit.findReplace"));
        assert_eq!(
            shortcut_command("f", true, false),
            Some("edit.findInProject")
        );
        assert_eq!(shortcut_command("p", false, false), Some("file.quickOpen"));
        assert_eq!(shortcut_command("b", true, false), None);
        assert_eq!(shortcut_command("p", true, false), None);
    }
}
