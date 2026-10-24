use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Recent {
    pub path: String,
    pub name: String,
}
#[derive(Default, Serialize, Deserialize)]
pub struct Preferences {
    pub recent: Vec<Recent>,
}
pub struct DesktopState {
    pub authentication: Mutex<HashMap<String, re_edit_pdf_native::authentication::Protection>>,
    pub preferences: Mutex<Preferences>,
    pub file: PathBuf,
    pub current: Mutex<Option<String>>,
    pub allowed: Mutex<HashSet<PathBuf>>,
    pub allowed_saves: Mutex<HashSet<PathBuf>>,
    pub pending: Mutex<Vec<PathBuf>>,
    pub ready: AtomicBool,
    pub allow_close: AtomicBool,
}
impl DesktopState {
    pub fn should_confirm_close(&self) -> bool {
        self.ready.load(Ordering::Acquire) && !self.allow_close.load(Ordering::Acquire)
    }
    pub fn load(path: PathBuf) -> Self {
        let p: Preferences = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let allowed = p
            .recent
            .iter()
            .filter_map(|r| std::fs::canonicalize(&r.path).ok())
            .collect();
        Self {
            authentication: Mutex::new(HashMap::new()),
            preferences: Mutex::new(p),
            file: path,
            current: Mutex::new(None),
            allowed: Mutex::new(allowed),
            allowed_saves: Mutex::new(HashSet::new()),
            pending: Mutex::new(Vec::new()),
            ready: AtomicBool::new(false),
            allow_close: AtomicBool::new(false),
        }
    }
    pub fn authorize(&self, path: &Path) -> Result<PathBuf> {
        let p = std::fs::canonicalize(path)?;
        self.allowed.lock().unwrap().insert(p.clone());
        Ok(p)
    }
    pub fn readable(&self, path: &Path) -> Result<PathBuf> {
        let p = std::fs::canonicalize(path)?;
        ensure!(
            self.allowed.lock().unwrap().contains(&p),
            "Choose this PDF with Open before reading it"
        );
        Ok(p)
    }
    pub fn remember(&self, path: &Path) -> Result<()> {
        let path = self.authorize(path)?;
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let path = path.to_string_lossy().into_owned();
        let mut prefs = self.preferences.lock().unwrap();
        prefs.recent.retain(|r| r.path != path);
        prefs.recent.insert(
            0,
            Recent {
                path: path.clone(),
                name,
            },
        );
        prefs.recent.truncate(50);
        if let Some(dir) = self.file.parent() {
            std::fs::create_dir_all(dir)?;
        }
        re_edit_pdf_native::engine::atomic_write(&self.file, &serde_json::to_vec_pretty(&*prefs)?)?;
        *self.current.lock().unwrap() = Some(path);
        Ok(())
    }
    pub fn open(&self, app: &AppHandle, path: &Path) -> Result<()> {
        let p = self.authorize(path)?;
        ensure!(
            p.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")),
            "Choose a PDF document"
        );
        self.remember(&p)?;
        let mut pending = self.pending.lock().unwrap();
        if self.ready.load(Ordering::Acquire) {
            app.emit("file:opened", p.to_string_lossy().into_owned())?;
        } else {
            pending.push(p);
        }
        drop(pending);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.maximize();
            if self.ready.load(Ordering::Acquire) {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        Ok(())
    }
    pub fn flush(&self, app: &AppHandle) -> Result<()> {
        let mut queue = self.pending.lock().unwrap();
        self.ready.store(true, Ordering::Release);
        let pending = std::mem::take(&mut *queue);
        drop(queue);
        for p in pending {
            app.emit("file:opened", p.to_string_lossy().into_owned())?;
        }
        Ok(())
    }
}
pub fn paths(args: &[String], cwd: &str) -> Vec<PathBuf> {
    args.iter()
        .skip(1)
        .filter_map(|arg| {
            let path = if arg.starts_with("file:") {
                url::Url::parse(arg).ok()?.to_file_path().ok()?
            } else {
                let p = PathBuf::from(arg);
                if arg.starts_with('-') {
                    return None;
                }
                if p.is_absolute() {
                    p
                } else {
                    Path::new(cwd).join(p)
                }
            };
            path.extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
                .then_some(path)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_close_does_not_wait_for_an_unregistered_renderer_listener() {
        let directory = tempfile::tempdir().unwrap();
        let state = DesktopState::load(directory.path().join("preferences.json"));
        assert!(!state.should_confirm_close());
        state.ready.store(true, Ordering::Release);
        assert!(state.should_confirm_close());
        state.allow_close.store(true, Ordering::Release);
        assert!(!state.should_confirm_close());
    }
    #[test]
    fn only_explicitly_selected_or_recent_files_are_readable() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.pdf");
        std::fs::write(&p, b"pdf").unwrap();
        let state = DesktopState::load(dir.path().join("preferences.json"));
        assert!(state.readable(&p).is_err());
        state.remember(&p).unwrap();
        assert!(state.readable(&p).is_ok());
        let restored = DesktopState::load(dir.path().join("preferences.json"));
        assert!(restored.readable(&p).is_ok());
    }
    #[test]
    fn file_uri_and_relative_paths_preserve_spaces() {
        let args = vec!["Re-Edit-PDF".into(), "my file.pdf".into(), "--flag".into()];
        let result = paths(&args, "D:/work");
        assert_eq!(result.len(), 1);
        assert!(result[0].ends_with("my file.pdf"));
    }
}
