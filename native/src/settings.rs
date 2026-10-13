use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recent {
    pub path: PathBuf,
    pub starred: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub dark: bool,
    pub single_key_tools: bool,
    pub recent: Vec<Recent>,
    pub smooth_scroll: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            dark: false,
            single_key_tools: false,
            recent: Vec::new(),
            smooth_scroll: true,
        }
    }
}
impl Settings {
    fn file() -> Option<PathBuf> {
        directories::ProjectDirs::from("com", "avaneeshinamdar", "re-edit-pdf-native")
            .map(|d| d.config_dir().join("settings.json"))
    }
    pub fn load() -> Self {
        Self::file()
            .and_then(|p| std::fs::read(p).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }
    pub fn save(&self) -> anyhow::Result<()> {
        if let Some(path) = Self::file() {
            std::fs::create_dir_all(path.parent().unwrap())?;
            crate::engine::atomic_write(&path, &serde_json::to_vec_pretty(self)?)?;
        }
        Ok(())
    }
    pub fn remember(&mut self, path: &Path) {
        let starred = self
            .recent
            .iter()
            .find(|r| r.path == path)
            .is_some_and(|r| r.starred);
        self.recent.retain(|r| r.path != path);
        self.recent.insert(
            0,
            Recent {
                path: path.into(),
                starred,
            },
        );
        let mut seen = 0;
        self.recent.retain(|r| {
            if r.starred {
                true
            } else {
                seen += 1;
                seen <= 20
            }
        });
    }
}
