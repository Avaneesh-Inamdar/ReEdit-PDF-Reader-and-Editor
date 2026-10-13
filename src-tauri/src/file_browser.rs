use crate::state::DesktopState;
use anyhow::{Context, Result, ensure};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub directory: bool,
    pub size: u64,
}
#[derive(Serialize)]
pub struct Place {
    name: String,
    path: String,
}
#[derive(Serialize)]
pub struct Listing {
    path: String,
    parent: Option<String>,
    entries: Vec<Entry>,
    places: Vec<Place>,
}
#[tauri::command]
pub async fn browse_files(app: AppHandle, path: Option<String>) -> Result<Listing, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Listing> {
        let paths = app.path();
        let home = paths.home_dir()?;
        let path = std::fs::canonicalize(path.map(PathBuf::from).unwrap_or(home.clone()))?;
        ensure!(path.is_dir(), "Choose a folder");
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(&path)?.take(20000) {
            let Ok(entry) = entry else { continue };
            let Ok(meta) = entry.metadata() else { continue };
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            };
            entries.push(Entry {
                name,
                path: entry.path().to_string_lossy().into_owned(),
                directory: meta.is_dir(),
                size: meta.len(),
            });
        }
        entries.sort_by(|a, b| {
            b.directory
                .cmp(&a.directory)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        let mut places = vec![Place {
            name: "Home".into(),
            path: home.to_string_lossy().into_owned(),
        }];
        for (name, path) in [
            ("Desktop", paths.desktop_dir()),
            ("Documents", paths.document_dir()),
            ("Downloads", paths.download_dir()),
        ] {
            if let Ok(path) = path {
                if path.is_dir() {
                    places.push(Place {
                        name: name.into(),
                        path: path.to_string_lossy().into_owned(),
                    })
                }
            }
        }
        #[cfg(windows)]
        for letter in b'A'..=b'Z' {
            let root = format!("{}:\\", letter as char);
            if Path::new(&root).exists() {
                places.push(Place {
                    name: format!("Drive {}:", letter as char),
                    path: root,
                })
            }
        }
        Ok(Listing {
            parent: path.parent().map(|p| p.to_string_lossy().into_owned()),
            path: path.to_string_lossy().into_owned(),
            entries,
            places,
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn choose_file(app: AppHandle, path: String, save: bool) -> Result<(), String> {
    (|| -> Result<()> {
        let path = Path::new(&path);
        if save {
            let parent =
                std::fs::canonicalize(path.parent().context("Choose a destination folder")?)?;
            let name = path.file_name().context("Enter a filename")?;
            let target = parent.join(name);
            ensure!(!target.is_dir(), "Choose a file, not a folder");
            app.state::<DesktopState>()
                .allowed_saves
                .lock()
                .unwrap()
                .insert(target);
        } else {
            app.state::<DesktopState>().authorize(path)?;
        }
        Ok(())
    })()
    .map_err(|e| e.to_string())
}
pub fn destination(app: &AppHandle, path: &str) -> Result<PathBuf> {
    let path = Path::new(path);
    let parent = std::fs::canonicalize(path.parent().context("Missing destination folder")?)?;
    let path = parent.join(path.file_name().context("Missing filename")?);
    ensure!(
        app.state::<DesktopState>()
            .allowed_saves
            .lock()
            .unwrap()
            .contains(&path),
        "Choose this destination using Save As"
    );
    Ok(path)
}
#[tauri::command]
pub async fn pick_files_native(
    app: AppHandle,
    title: String,
    extensions: Vec<String>,
    multiple: bool,
) -> Result<Vec<String>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window is unavailable")?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<String>> {
        let mut dialog = rfd::FileDialog::new().set_title(&title).set_parent(&window);
        if !extensions.is_empty() {
            dialog = dialog.add_filter("Supported files", &extensions);
        }
        let selected = if multiple {
            dialog.pick_files().unwrap_or_default()
        } else {
            dialog.pick_file().into_iter().collect()
        };
        let state = app.state::<DesktopState>();
        selected
            .into_iter()
            .map(|path| {
                state
                    .authorize(&path)
                    .map(|path| path.to_string_lossy().into_owned())
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_chosen_pdf(app: AppHandle, path: String) -> Result<String, String> {
    let selected = app
        .state::<DesktopState>()
        .readable(Path::new(&path))
        .map_err(|e| e.to_string())?;
    app.state::<DesktopState>()
        .open(&app, &selected)
        .map_err(|e| e.to_string())?;
    Ok(selected.to_string_lossy().into_owned())
}
