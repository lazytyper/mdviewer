use std::sync::Mutex;
use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

/// The path passed at launch (CLI arg or OS file association), if any.
pub struct StartupPath(pub Mutex<Option<String>>);

/// First argument that is not the program name and does not start with '-'.
fn first_markdown_arg(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .cloned()
}

#[tauri::command]
fn get_startup_path(state: tauri::State<StartupPath>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

fn read_markdown_impl(path: &str) -> Result<String, String> {
    use std::io::ErrorKind;
    std::fs::read_to_string(path).map_err(|e| match e.kind() {
        ErrorKind::NotFound => format!("Datei nicht gefunden: {path}"),
        ErrorKind::IsADirectory => format!("Kein regulärer Dateipfad: {path}"),
        _ => format!("Konnte Datei nicht lesen: {e}"),
    })
}

#[tauri::command]
fn read_markdown(path: String) -> Result<String, String> {
    read_markdown_impl(&path)
}

/// Holds the active watcher so it is dropped/replaced when a new file opens.
pub struct WatcherState(pub Mutex<Option<notify::RecommendedWatcher>>);

#[tauri::command]
fn start_watching(
    path: String,
    app: AppHandle,
    state: tauri::State<WatcherState>,
) -> Result<(), String> {
    let target = std::path::PathBuf::from(&path);
    let parent = target
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Kein übergeordnetes Verzeichnis".to_string())?;

    let app_handle = app.clone();
    let target_for_cb = target.clone();

    let mut watcher = notify::recommended_watcher(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let relevant = matches!(
                    event.kind,
                    notify::EventKind::Modify(_) | notify::EventKind::Create(_)
                );
                if relevant && event.paths.iter().any(|p| p == &target_for_cb) {
                    let _ = app_handle.emit("file-changed", target_for_cb.to_string_lossy().to_string());
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup = first_markdown_arg(&std::env::args().collect::<Vec<_>>());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            app.manage(StartupPath(Mutex::new(startup.clone())));
            app.manage(WatcherState(Mutex::new(None)));
            let print_item = MenuItemBuilder::new("Drucken…")
                .id("print")
                .accelerator("CmdOrCtrl+P")
                .build(app)?;
            let file_menu = SubmenuBuilder::new(app, "Datei")
                .item(&print_item)
                .build()?;
            let menu = MenuBuilder::new(app).item(&file_menu).build()?;
            app.set_menu(menu)?;
            app.on_menu_event(move |app, event| {
                if event.id() == "print" {
                    let _ = app.emit("menu-print", ());
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_markdown,
            get_startup_path,
            start_watching
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::read_markdown_impl;
    use super::first_markdown_arg;

    #[test]
    fn reads_existing_file() {
        let dir = std::env::temp_dir().join("mdv_test_read");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.md");
        std::fs::write(&f, "# Hi").unwrap();
        let out = read_markdown_impl(f.to_str().unwrap());
        assert_eq!(out.unwrap(), "# Hi");
    }

    #[test]
    fn errors_on_missing_file() {
        let out = read_markdown_impl("/does/not/exist_42.md");
        assert!(out.is_err());
        assert!(out.unwrap_err().contains("nicht gefunden"));
    }

    #[test]
    fn errors_on_directory() {
        let dir = std::env::temp_dir();
        let out = read_markdown_impl(dir.to_str().unwrap());
        assert!(out.is_err());
        let err = out.unwrap_err();
        assert!(err.contains("Kein regulärer Dateipfad"), "got: {err}");
    }

    #[test]
    fn picks_first_non_flag_arg() {
        let args = vec![
            "mdviewer".to_string(),
            "--flag".to_string(),
            "/tmp/doc.md".to_string(),
        ];
        assert_eq!(first_markdown_arg(&args), Some("/tmp/doc.md".to_string()));
    }

    #[test]
    fn returns_none_without_path() {
        let args = vec!["mdviewer".to_string()];
        assert_eq!(first_markdown_arg(&args), None);
    }
}
