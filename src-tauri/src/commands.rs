use crate::state::{DesktopState, Recent};
use anyhow::{Context, Result, ensure};
use re_edit_pdf_native::{
    content_removal::{self, Region},
    engine::atomic_write,
    fonts,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{path::Path, sync::atomic::Ordering};
use tauri::{
    AppHandle, Manager, State,
    ipc::{InvokeBody, Request, Response},
};

pub(crate) fn metadata<T: DeserializeOwned>(request: &Request<'_>) -> Result<T> {
    let value = request
        .headers()
        .get("x-reedit-options")
        .context("Missing request options")?
        .to_str()?;
    let value = percent_encoding::percent_decode_str(value).decode_utf8()?;
    Ok(serde_json::from_str(&value)?)
}
fn raw(request: &Request<'_>) -> Result<Vec<u8>> {
    match request.body() {
        InvokeBody::Raw(bytes) => {
            ensure!(
                bytes.len() <= 1024 * 1024 * 1024,
                "File exceeds the 1 GiB import limit"
            );
            Ok(bytes.clone())
        }
        _ => anyhow::bail!("Expected a binary request"),
    }
}
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn open_pdf(app: AppHandle) -> Result<Option<String>, String> {
    let paths = crate::file_browser::pick_files_native(
        app.clone(),
        "Open PDF".into(),
        vec!["pdf".into()],
        false,
    )
    .await?;
    if let Some(path) = paths.first() {
        app.state::<DesktopState>()
            .open(&app, Path::new(path))
            .map_err(|e| e.to_string())?;
        Ok(Some(path.clone()))
    } else {
        Ok(None)
    }
}
#[tauri::command]
pub async fn pick_pdfs(app: AppHandle) -> Result<Vec<String>, String> {
    crate::file_browser::pick_files_native(app, "Choose PDF files".into(), vec!["pdf".into()], true)
        .await
}
#[tauri::command]
pub async fn read_pdf(app: AppHandle, file_path: String) -> Result<Response, String> {
    let path = app
        .state::<DesktopState>()
        .readable(Path::new(&file_path))
        .map_err(|e| e.to_string())?;
    blocking(move || Ok(Response::new(std::fs::read(path)?))).await
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSecurity {
    encrypted: bool,
    password_required: bool,
    permissions: Vec<u32>,
}
#[tauri::command]
pub async fn pdf_security(request: Request<'_>) -> Result<PdfSecurity, String> {
    let bytes = raw(&request).map_err(|e| e.to_string())?;
    blocking(move || {
        let (encrypted, password_required) = re_edit_pdf_native::authentication::security(&bytes)?;
        let permissions = re_edit_pdf_native::authentication::source_permissions(&bytes)?;
        Ok(PdfSecurity { encrypted, password_required, permissions })
    }).await
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnlockOptions {
    authentication_id: String,
    password: Option<String>,
}
#[tauri::command]
pub async fn unlock_pdf(app: AppHandle, request: Request<'_>) -> Result<Response, String> {
    let options: UnlockOptions = metadata(&request).map_err(|_| "Invalid authentication options".to_string())?;
    let bytes = raw(&request).map_err(|e| e.to_string())?;
    blocking(move || {
        ensure!(!options.authentication_id.is_empty() && options.authentication_id.len() <= 128 && options.authentication_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'), "Invalid authentication session");
        let (protection, working) = re_edit_pdf_native::authentication::Protection::unlock(bytes, options.password.as_deref())?;
        let state = app.state::<DesktopState>();
        let mut sessions = state.authentication.lock().unwrap();
        ensure!(sessions.len() < 100, "Close another protected document first");
        ensure!(!sessions.contains_key(&options.authentication_id), "Authentication session already exists");
        sessions.insert(options.authentication_id, protection);
        Ok(Response::new(working))
    }).await
}
#[tauri::command]
pub fn close_pdf_authentication(state: State<'_, DesktopState>, authentication_id: String) {
    state.authentication.lock().unwrap().remove(&authentication_id);
}
#[cfg(feature = "desktop-test")]
#[tauri::command]
pub fn pdf_authentication_count(state: State<'_, DesktopState>) -> usize {
    state.authentication.lock().unwrap().len()
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveOptions {
    default_name: Option<String>,
    file_path: Option<String>,
    save_as: Option<bool>,
    chosen_path: Option<String>,
    authentication_id: Option<String>,
}
fn ensure_unprotected_export_destination(path: &Path) -> Result<()> {
    if path.is_file() && path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("pdf")) {
        let existing = std::fs::read(path)?;
        if let Ok((encrypted, _)) = re_edit_pdf_native::authentication::security(&existing) {
            ensure!(!encrypted, "This destination is a protected PDF. Choose another name for the exported copy.");
        }
    }
    Ok(())
}
#[cfg(test)]
mod authentication_tests {
    use super::*;
    use re_edit_pdf_native::mupdf::{Size, pdf::{Encryption, PdfDocument, PdfWriteOptions}};

    #[test]
    fn unprotected_exports_cannot_overwrite_a_password_protected_destination() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("protected.pdf");
        let mut doc = PdfDocument::new();
        doc.new_page(Size::A4).unwrap();
        let mut options = PdfWriteOptions::default();
        options.set_encryption(Encryption::Aes256).set_user_password("open-secret").set_owner_password("owner-secret");
        doc.save_with_options(path.to_str().unwrap(), options).unwrap();
        let original = std::fs::read(&path).unwrap();
        assert!(ensure_unprotected_export_destination(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        let plain = directory.path().join("plain.pdf");
        let mut unprotected = PdfDocument::new();
        unprotected.new_page(Size::A4).unwrap();
        let mut options = PdfWriteOptions::default();
        options.set_encryption(Encryption::None);
        unprotected.save_with_options(plain.to_str().unwrap(), options).unwrap();
        assert!(ensure_unprotected_export_destination(&plain).is_ok());
        assert!(ensure_unprotected_export_destination(&directory.path().join("new.pdf")).is_ok());
    }
}
#[tauri::command]
pub async fn save_pdf(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let options: SaveOptions = metadata(&request).map_err(|e| e.to_string())?;
    let bytes = raw(&request).map_err(|e| e.to_string())?;
    let existing = if options.save_as.unwrap_or(false) {
        None
    } else {
        options.file_path
    };
    // Browser file drops have a document name rather than an authorized native
    // path. Those documents use Save As instead of writing to an inferred path.
    let existing = if let Some(path) = options.chosen_path {
        Some(crate::file_browser::destination(&app, &path).map_err(|e| e.to_string())?)
    } else {
        existing.and_then(|p| app.state::<DesktopState>().readable(Path::new(&p)).ok())
    };
    let name = options.default_name.unwrap_or("document.pdf".into());
    let handle = app.clone();
    let result = blocking(move || {
        let path = existing.or_else(|| {
            rfd::FileDialog::new()
                .add_filter("PDF documents", &["pdf"])
                .set_file_name(name)
                .save_file()
        });
        if let Some(path) = &path {
            let protected = if let Some(id) = options.authentication_id {
                let state = handle.state::<DesktopState>();
                let sessions = state.authentication.lock().unwrap();
                Some(sessions.get(&id).context("The document password session has expired; reopen the PDF")?.protect(&bytes)?)
            } else {
                ensure_unprotected_export_destination(path)?;
                None
            };
            atomic_write(path, protected.as_deref().unwrap_or(&bytes))?;
        }
        Ok(path)
    })
    .await?;
    if let Some(path) = &result {
        app.state::<DesktopState>()
            .remember(path)
            .map_err(|e| e.to_string())?;
    }
    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}
#[derive(Deserialize)]
struct AttachmentOptions {
    name: String,
    chosen_path: Option<String>,
}
#[tauri::command]
pub async fn save_attachment(
    app: AppHandle,
    request: Request<'_>,
) -> Result<Option<String>, String> {
    let options: AttachmentOptions = metadata(&request).map_err(|e| e.to_string())?;
    let bytes = raw(&request).map_err(|e| e.to_string())?;
    let chosen = options
        .chosen_path
        .map(|path| crate::file_browser::destination(&app, &path))
        .transpose()
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    blocking(move || {
        let name = Path::new(&options.name)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        let path = chosen.or_else(|| rfd::FileDialog::new().set_file_name(name).save_file());
        if let Some(path) = &path {
            ensure_unprotected_export_destination(path)?;
            atomic_write(path, &bytes)?;
            handle.state::<DesktopState>().authorize(path)?;
        }
        Ok(path.map(|p| p.to_string_lossy().into_owned()))
    })
    .await
}
#[tauri::command]
pub fn recent_files(state: State<'_, DesktopState>) -> Vec<Recent> {
    state.preferences.lock().unwrap().recent.clone()
}
#[tauri::command]
pub fn remove_recent(state: State<'_, DesktopState>, path: String) -> Result<(), String> {
    let mut prefs = state.preferences.lock().unwrap();
    prefs.recent.retain(|r| r.path != path);
    atomic_write(
        &state.file,
        &serde_json::to_vec_pretty(&*prefs).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn current_path(state: State<'_, DesktopState>) -> Option<String> {
    state.current.lock().unwrap().clone()
}
#[tauri::command]
pub fn renderer_ready(app: AppHandle) -> Result<(), String> {
    app.state::<DesktopState>()
        .flush(&app)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn confirm_close(name: String) -> Result<String, String> {
    blocking(move || {
        let result = rfd::MessageDialog::new()
            .set_title("Unsaved changes")
            .set_description(format!("Save changes to ‘{name}’ before closing?"))
            .set_buttons(rfd::MessageButtons::YesNoCancel)
            .show();
        Ok(match result {
            rfd::MessageDialogResult::Yes => "save",
            rfd::MessageDialogResult::No => "discard",
            _ => "cancel",
        }
        .into())
    })
    .await
}
#[tauri::command]
pub fn force_close(app: AppHandle) -> Result<(), String> {
    app.state::<DesktopState>()
        .allow_close
        .store(true, Ordering::Release);
    app.get_webview_window("main")
        .context("Window is closed")
        .map_err(|e| e.to_string())?
        .close()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart()
}
#[tauri::command]
pub fn set_title(app: AppHandle, title: String) -> Result<(), String> {
    app.get_webview_window("main")
        .context("Window is closed")
        .map_err(|e| e.to_string())?
        .set_title(&title)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn minimize(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("Window is closed")?
        .minimize()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn maximize(app: AppHandle) -> Result<bool, String> {
    let w = app.get_webview_window("main").ok_or("Window is closed")?;
    if w.is_maximized().map_err(|e| e.to_string())? {
        w.unmaximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        w.maximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
}
#[tauri::command]
pub fn is_maximized(app: AppHandle) -> Result<bool, String> {
    app.get_webview_window("main")
        .ok_or("Window is closed")?
        .is_maximized()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn request_close(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("Window is closed")?
        .close()
        .map_err(|e| e.to_string())
}
#[derive(Deserialize)]
struct RemovalOptions {
    regions: Vec<Region>,
    secure: bool,
}
#[tauri::command]
pub async fn remove_pdf_content(request: Request<'_>) -> Result<Response, String> {
    let options: RemovalOptions = metadata(&request).map_err(|e| e.to_string())?;
    let bytes = raw(&request).map_err(|e| e.to_string())?;
    blocking(move || {
        Ok(Response::new(content_removal::remove(
            &bytes,
            &options.regions,
            options.secure,
        )?))
    })
    .await
}
#[tauri::command]
pub async fn normalize_font(request: Request<'_>) -> Result<Response, String> {
    let bytes = raw(&request).map_err(|e| e.to_string())?;
    blocking(move || Ok(Response::new(fonts::normalize(&bytes)?))).await
}
#[derive(Clone, Serialize)]
pub struct SystemFont {
    pub id: String,
    pub name: String,
    pub family: String,
    pub bold: bool,
    pub italic: bool,
}
#[tauri::command]
pub async fn system_fonts() -> Result<Vec<SystemFont>, String> {
    blocking(|| {
        let source = font_kit::source::SystemSource::new();
        let mut result = Vec::new();
        for handle in source.all_fonts()? {
            if let font_kit::handle::Handle::Path {
                path,
                font_index: 0,
            } = &handle
            {
                if !path
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("ttf") || e.eq_ignore_ascii_case("otf"))
                {
                    continue;
                }
                if let Ok(font) = handle.load() {
                    let name = font.full_name();
                    let properties = font.properties();
                    result.push(SystemFont {
                        id: path.to_string_lossy().into_owned(),
                        name,
                        family: font.family_name(),
                        bold: properties.weight.0 >= 600.,
                        italic: properties.style != font_kit::properties::Style::Normal,
                    });
                }
            }
        }
        result.sort_by(|a, b| a.name.cmp(&b.name));
        result.dedup_by(|a, b| a.name == b.name);
        Ok(result)
    })
    .await
}
#[tauri::command]
pub async fn read_system_font(id: String) -> Result<Response, String> {
    blocking(move || {
        let requested = std::fs::canonicalize(&id)?;
        let allowed = font_kit::source::SystemSource::new()
            .all_fonts()?
            .into_iter()
            .any(|h| match h {
                font_kit::handle::Handle::Path {
                    path,
                    font_index: 0,
                } => std::fs::canonicalize(path)
                    .ok()
                    .is_some_and(|p| p == requested),
                _ => false,
            });
        ensure!(allowed, "Unknown system font");
        Ok(Response::new(std::fs::read(requested)?))
    })
    .await
}

#[tauri::command]
pub async fn check_updates() -> Result<crate::services::UpdateResult, String> {
    blocking(crate::services::check_updates).await
}
#[tauri::command]
pub fn open_releases() -> Result<(), String> {
    crate::services::open_url(crate::services::RELEASES).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn open_default_apps() -> Result<(), String> {
    #[cfg(windows)]
    return crate::services::open_url("ms-settings:defaultapps").map_err(|e| e.to_string());
    #[cfg(target_os = "linux")]
    {
        let status = std::process::Command::new("xdg-mime")
            .args(["default", "Re-Edit-PDF.desktop", "application/pdf"])
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("The desktop could not set the PDF application".into())
        }
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    return Err("Choose Re-Edit PDF using your system's Open With settings".into());
}
#[tauri::command]
pub async fn import_office(app: AppHandle) -> Result<Option<String>, String> {
    let result = blocking(|| {
        let source = rfd::FileDialog::new()
            .add_filter(
                "Office documents",
                &["docx", "doc", "odt", "rtf", "xlsx", "xls", "pptx", "ppt"],
            )
            .pick_file();
        let Some(source) = source else {
            return Ok(None);
        };
        let bytes = crate::services::import_office(&source)?;
        let name = format!(
            "{}.pdf",
            source.file_stem().unwrap_or_default().to_string_lossy()
        );
        let target = rfd::FileDialog::new()
            .add_filter("PDF document", &["pdf"])
            .set_file_name(name)
            .save_file();
        if let Some(target) = &target {
            ensure_unprotected_export_destination(target)?;
            atomic_write(target, &bytes)?;
        }
        Ok(target)
    })
    .await?;
    if let Some(path) = &result {
        app.state::<DesktopState>()
            .open(&app, path)
            .map_err(|e| e.to_string())?;
    }
    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}
#[tauri::command]
pub async fn export_word(
    pages: Vec<Vec<crate::services::WordLine>>,
    name: String,
) -> Result<Option<String>, String> {
    blocking(move || {
        let bytes = crate::services::export_word(pages)?;
        let filename = format!(
            "{}.docx",
            Path::new(&name)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
        );
        let path = rfd::FileDialog::new()
            .add_filter("Word document", &["docx"])
            .set_file_name(filename)
            .save_file();
        if let Some(path) = &path {
            ensure_unprotected_export_destination(path)?;
            atomic_write(path, &bytes)?;
        }
        Ok(path.map(|p| p.to_string_lossy().into_owned()))
    })
    .await
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignOptions {
    password: String,
    name: String,
    reason: String,
    certificate_path: Option<String>,
    chosen_path: Option<String>,
}
#[tauri::command]
pub async fn sign_certificate(
    app: AppHandle,
    request: Request<'_>,
) -> Result<Option<String>, String> {
    let bytes = raw(&request).map_err(|e| e.to_string())?;
    let options: SignOptions = metadata(&request).map_err(|e| e.to_string())?;
    let selected = options
        .certificate_path
        .as_ref()
        .map(|p| app.state::<DesktopState>().readable(Path::new(p)))
        .transpose()
        .map_err(|e| e.to_string())?;
    let chosen = options
        .chosen_path
        .as_ref()
        .map(|p| crate::file_browser::destination(&app, p))
        .transpose()
        .map_err(|e| e.to_string())?;
    blocking(move || {
        let certificate = selected.or_else(|| {
            rfd::FileDialog::new()
                .add_filter("Signing certificate", &["p12", "pfx"])
                .pick_file()
        });
        let Some(certificate) = certificate else {
            return Ok(None);
        };
        let signed = pdf_signer::sign_pdf_bytes(
            &bytes,
            &std::fs::read(certificate)?,
            &options.password,
            &pdf_signer::SignOptions {
                name: Some(options.name),
                reason: Some(options.reason),
                ..Default::default()
            },
        )?;
        let path = chosen.or_else(|| {
            rfd::FileDialog::new()
                .add_filter("Signed PDF", &["pdf"])
                .set_file_name("signed.pdf")
                .save_file()
        });
        if let Some(path) = &path {
            ensure_unprotected_export_destination(path)?;
            atomic_write(path, &signed)?;
        }
        Ok(path.map(|p| p.to_string_lossy().into_owned()))
    })
    .await
}
#[tauri::command]
pub async fn export_word_bytes(
    pages: Vec<Vec<crate::services::WordLine>>,
) -> Result<Response, String> {
    blocking(move || Ok(Response::new(crate::services::export_word(pages)?))).await
}
#[tauri::command]
pub async fn import_office_bytes(app: AppHandle, file_path: String) -> Result<Response, String> {
    let source = app
        .state::<DesktopState>()
        .readable(Path::new(&file_path))
        .map_err(|e| e.to_string())?;
    blocking(move || Ok(Response::new(crate::services::import_office(&source)?))).await
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterOption {
    name: String,
    display_name: String,
    is_default: bool,
    available: bool,
    is_virtual: bool,
}
#[tauri::command]
pub async fn printers() -> Result<Vec<PrinterOption>, String> {
    blocking(|| {
        Ok(re_edit_pdf_native::platform_print::printers()?
            .into_iter()
            .map(|p| PrinterOption {
                display_name: p.name.clone(),
                name: p.name,
                is_default: p.default,
                available: p.available,
                is_virtual: p.virtual_printer,
            })
            .collect())
    })
    .await
}
#[derive(Deserialize)]
pub struct PrintImage {
    image: String,
    width: f32,
    height: f32,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyPrintOptions {
    device_name: String,
    copies: usize,
    color: bool,
    duplex: String,
    paper: String,
    landscape: bool,
    scale: String,
    pages: Vec<usize>,
    collate: Option<bool>,
    custom_scale: Option<f32>,
    handling: Option<String>,
    columns: Option<usize>,
    rows: Option<usize>,
    tile_scale: Option<f32>,
    overlap: Option<f32>,
    auto_rotate: Option<bool>,
    page_order: Option<String>,
    print_page_border: Option<bool>,
    booklet_binding: Option<String>,
    booklet_subset: Option<String>,
}
fn print_options(o: &LegacyPrintOptions) -> re_edit_pdf_native::printing::PrintOptions {
    use re_edit_pdf_native::printing::{
        Binding, BookletSubset, Duplex, Handling, PageOrder, PrintOptions, Scale,
    };
    let booklet_subset = match o.booklet_subset.as_deref() {
        Some("front") => BookletSubset::Front,
        Some("back") => BookletSubset::Back,
        _ => BookletSubset::Both,
    };
    PrintOptions {
        printer: o.device_name.clone(),
        copies: o.copies,
        collate: o.collate.unwrap_or(true),
        color: o.color,
        duplex: if o.handling.as_deref() == Some("booklet") && booklet_subset != BookletSubset::Both
        {
            Duplex::Off // Manual booklet passes each contain only one side of each sheet.
        } else {
            match o.duplex.as_str() {
                "longEdge" => Duplex::LongEdge,
                "shortEdge" => Duplex::ShortEdge,
                _ => Duplex::Off,
            }
        },
        paper: if o.paper == "Letter" {
            [612., 792.]
        } else {
            [595.276, 841.89]
        },
        landscape: o.landscape,
        scale: match o.scale.as_str() {
            "actual" => Scale::Actual,
            "shrink" => Scale::Shrink,
            "custom" => Scale::Custom(o.custom_scale.unwrap_or(100.)),
            _ => Scale::Fit,
        },
        handling: match o.handling.as_deref() {
            Some("multiple") => Handling::Multiple {
                columns: o.columns.unwrap_or(2),
                rows: o.rows.unwrap_or(2),
            },
            Some("booklet") => Handling::Booklet,
            Some("poster") => Handling::Poster {
                percent: o.tile_scale.unwrap_or(100.),
                overlap: o.overlap.unwrap_or(0.),
            },
            _ => Handling::Size,
        },
        auto_rotate: o.auto_rotate.unwrap_or(true),
        page_order: match o.page_order.as_deref() {
            Some("horizontalReversed") => PageOrder::HorizontalReversed,
            Some("vertical") => PageOrder::Vertical,
            Some("verticalReversed") => PageOrder::VerticalReversed,
            _ => PageOrder::Horizontal,
        },
        print_page_border: o.print_page_border.unwrap_or(false),
        booklet_binding: if o.booklet_binding.as_deref() == Some("right") {
            Binding::Right
        } else {
            Binding::Left
        },
        booklet_subset,
        original_paper: o.paper == "original",
        range: o
            .pages
            .iter()
            .map(usize::to_string)
            .collect::<Vec<_>>()
            .join(","),
        ..Default::default()
    }
}

#[cfg(test)]
mod print_request_tests {
    use super::*;
    use re_edit_pdf_native::printing::plan;
    use serde_json::{Value, json};

    fn request(extra: Value) -> LegacyPrintOptions {
        let mut value = json!({
            "deviceName": "Test printer", "copies": 2, "color": true,
            "duplex": "simplex", "paper": "Letter", "landscape": false,
            "scale": "fit", "pages": [3, 1, 2]
        });
        value
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn older_print_requests_keep_defaults_and_selected_order() {
        let options = print_options(&request(json!({})));
        assert!(options.collate && options.auto_rotate);
        let sheets = plan(&options, &[[100., 200.]; 3]).unwrap();
        assert_eq!(sheets.len(), 3);
        assert_eq!(
            sheets
                .iter()
                .map(|s| s.placements[0].page)
                .collect::<Vec<_>>(),
            vec![2, 0, 1]
        );
        assert_eq!(sheets[0].size, [612., 792.]);
    }

    #[test]
    fn renderer_scale_options_change_the_printed_dimensions() {
        for (scale, percent, expected_width) in [
            ("actual", 75., 100.),
            ("shrink", 75., 100.),
            ("custom", 75., 75.),
        ] {
            let options = print_options(&request(json!({
                "scale": scale, "customScale": percent, "autoRotate": false
            })));
            let sheets = plan(&options, &[[100., 200.]; 3]).unwrap();
            assert_eq!(sheets[0].placements[0].target.w, expected_width);
        }
        let options = print_options(&request(json!({"scale": "shrink", "autoRotate": false})));
        let sheets = plan(&options, &[[1000., 2000.]; 3]).unwrap();
        assert!(sheets[0].placements[0].target.w < 1000.);
    }

    #[test]
    fn renderer_handling_options_produce_imposed_sheets() {
        let multiple = print_options(&request(json!({
            "handling": "multiple", "columns": 2, "rows": 1,
            "collate": false, "autoRotate": false
        })));
        assert!(!multiple.collate && !multiple.auto_rotate);
        let sheets = plan(&multiple, &[[612., 792.]; 3]).unwrap();
        assert_eq!(sheets.len(), 2);
        assert_eq!(
            sheets[0]
                .placements
                .iter()
                .map(|p| p.page)
                .collect::<Vec<_>>(),
            vec![2, 0]
        );
        assert_eq!(sheets[1].placements[0].page, 1);

        let booklet = print_options(&request(json!({
            "handling": "booklet", "landscape": true, "duplex": "shortEdge"
        })));
        assert_eq!(
            booklet.duplex,
            re_edit_pdf_native::printing::Duplex::ShortEdge
        );
        let sheets = plan(&booklet, &[[612., 792.]; 3]).unwrap();
        assert_eq!(sheets.len(), 2);
        assert_eq!(sheets[0].size, [792., 612.]);
        assert_eq!(sheets[0].placements[0].page, 2);
        assert_eq!(sheets[0].placements[0].clip.x, 396.); // Blank outside cover on the left.

        let poster = print_options(&request(json!({
            "handling": "poster", "tileScale": 200., "overlap": 12., "pages": [1]
        })));
        let sheets = plan(&poster, &[[612., 792.]]).unwrap();
        assert_eq!(sheets.len(), 9);
        assert_eq!(sheets[0].placements[0].target.w, 1224.);
        assert_eq!(sheets[1].placements[0].target.x, 18. - (576. - 12.));
    }

    #[test]
    fn invalid_renderer_layout_parameters_are_rejected_before_output() {
        for extra in [
            json!({"scale": "custom", "customScale": 0}),
            json!({"handling": "multiple", "columns": 0, "rows": 1}),
            json!({"handling": "poster", "tileScale": 0}),
            json!({"handling": "poster", "tileScale": 100, "overlap": 999}),
        ] {
            assert!(plan(&print_options(&request(extra)), &[[612., 792.]; 3]).is_err());
        }
    }

    #[test]
    fn renderer_page_order_borders_and_manual_booklet_settings_reach_output() {
        let multiple = print_options(&request(
            json!({ "handling": "multiple", "columns": 2, "rows": 2,
            "pageOrder": "verticalReversed", "printPageBorder": true }),
        ));
        assert!(multiple.print_page_border);
        let sheets = plan(&multiple, &[[100., 200.]; 3]).unwrap();
        let a = &sheets[0].placements[0].clip;
        let b = &sheets[0].placements[1].clip;
        let c = &sheets[0].placements[2].clip;
        assert_eq!(a.x, b.x);
        assert!(a.x > c.x && a.y < b.y);
        for subset in ["front", "back"] {
            let o = print_options(&request(
                json!({ "handling": "booklet", "bookletBinding": "right",
                "bookletSubset": subset, "duplex": "shortEdge" }),
            ));
            assert_eq!(o.duplex, re_edit_pdf_native::printing::Duplex::Off);
            let sheets = plan(&o, &[[100., 200.]; 3]).unwrap();
            assert_eq!(sheets.len(), 1);
            let pages: Vec<_> = sheets[0].placements.iter().map(|p| p.page).collect();
            assert_eq!(
                pages,
                if subset == "front" {
                    vec![2]
                } else {
                    vec![1, 0]
                }
            );
        }
    }
}
#[tauri::command]
pub async fn begin_print(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let bytes = raw(&request).map_err(|e| e.to_string())?;
    blocking(move || {
        app.state::<crate::printing_session::Sessions>()
            .begin(bytes)
    })
    .await
}
#[tauri::command]
pub async fn preview_print(
    app: AppHandle,
    id: String,
    options: LegacyPrintOptions,
    sheet: usize,
) -> Result<crate::printing_session::Preview, String> {
    blocking(move || {
        app.state::<crate::printing_session::Sessions>().preview(
            &id,
            print_options(&options),
            sheet,
        )
    })
    .await
}
#[tauri::command]
pub async fn submit_print(
    app: AppHandle,
    id: String,
    options: LegacyPrintOptions,
) -> Result<(), String> {
    blocking(move || {
        app.state::<crate::printing_session::Sessions>()
            .print(&id, print_options(&options))
    })
    .await
}
#[tauri::command]
pub async fn export_print(
    app: AppHandle,
    id: String,
    options: LegacyPrintOptions,
) -> Result<Response, String> {
    blocking(move || {
        Ok(Response::new(
            app.state::<crate::printing_session::Sessions>()
                .export(&id, print_options(&options))?,
        ))
    })
    .await
}
#[tauri::command]
pub fn close_print(app: AppHandle, id: String) {
    app.state::<crate::printing_session::Sessions>().close(&id)
}
#[tauri::command]
pub async fn print_pdf(request: Request<'_>) -> Result<(), String> {
    let options: LegacyPrintOptions = metadata(&request).map_err(|e| e.to_string())?;
    let bytes = raw(&request).map_err(|e| e.to_string())?;
    blocking(move || {
        ensure!(
            !options.pages.is_empty(),
            "Choose at least one page to print"
        );
        let directory = tempfile::tempdir()?;
        let source = directory.path().join("source.pdf");
        std::fs::write(&source, bytes)?;
        let document = re_edit_pdf_native::engine::Engine::open(&source)?;
        let mut native = print_options(&options);
        native.original_paper = options.paper == "original";
        native.range = options
            .pages
            .iter()
            .map(usize::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let output = directory.path().join("job.pdf");
        document.print_pdf(&native, &output)?;
        re_edit_pdf_native::platform_print::submit(&output, &native)?;
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn print_images(
    pages: Vec<PrintImage>,
    options: LegacyPrintOptions,
) -> Result<(), String> {
    blocking(move || {
        use base64::Engine as _;
        use re_edit_pdf_native::engine::Engine;
        ensure!(!pages.is_empty(), "Choose at least one page to print");
        let mut document = re_edit_pdf_native::mupdf::pdf::PdfDocument::new();
        for image in pages {
            ensure!(
                image.width.is_finite()
                    && image.height.is_finite()
                    && image.width > 0.
                    && image.height > 0.,
                "Invalid printed page dimensions"
            );
            let base64 = image
                .image
                .strip_prefix("data:image/png;base64,")
                .context("Invalid print image")?;
            let bytes = base64::engine::general_purpose::STANDARD.decode(base64)?;
            let mut page = document.new_page((image.width, image.height))?;
            page.insert_image(
                &mut document,
                re_edit_pdf_native::mupdf::Rect::new(0., 0., image.width, image.height),
                re_edit_pdf_native::mupdf::pdf::page::PageImageSource::Bytes {
                    data: &bytes,
                    format_hint: Some("png"),
                },
                Default::default(),
            )?;
        }
        let dir = tempfile::tempdir()?;
        let source = dir.path().join("source.pdf");
        document.save(source.to_str().unwrap())?;
        let source = Engine::open(&source)?;
        let options = print_options(&options);
        let output = dir.path().join("job.pdf");
        source.print_pdf(&options, &output)?;
        re_edit_pdf_native::platform_print::submit(&output, &options)?;
        Ok(())
    })
    .await
}
