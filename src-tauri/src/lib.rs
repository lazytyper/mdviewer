fn read_markdown_impl(path: &str) -> Result<String, String> {
    let p = std::path::Path::new(path);
    if !p.exists() {
        return Err(format!("Datei nicht gefunden: {path}"));
    }
    if !p.is_file() {
        return Err(format!("Kein regulärer Dateipfad: {path}"));
    }
    std::fs::read_to_string(p).map_err(|e| format!("Konnte Datei nicht lesen: {e}"))
}

#[tauri::command]
fn read_markdown(path: String) -> Result<String, String> {
    read_markdown_impl(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_markdown])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::read_markdown_impl;

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
    }
}
