#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod app;
mod content_removal;
mod engine;
mod fonts;
mod icons;
mod input;
mod ocr;
mod platform_print;
mod printing;
mod selection;
mod settings;
fn main() -> anyhow::Result<()> {
    let mut paths = Vec::new();
    let mut test = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--ui-test" {
            test = args.next().map(std::path::PathBuf::from);
            if let Some(p) = &test {
                std::fs::create_dir_all(p)?;
            }
        } else if arg.starts_with("file:") {
            if let Ok(url) = url::Url::parse(&arg) {
                if let Ok(path) = url.to_file_path() {
                    paths.push(path);
                }
            }
        } else if !arg.starts_with('-') {
            paths.push(std::path::PathBuf::from(arg));
        }
    }
    let viewport = eframe::egui::ViewportBuilder::default()
        .with_title("Re-Edit PDF")
        .with_inner_size([1280., 840.])
        .with_min_inner_size([880., 600.])
        .with_decorations(true)
        .with_maximized(!paths.is_empty() && test.is_none());
    let viewport = if let Some(icon) = app::icon() {
        viewport.with_icon(icon)
    } else {
        viewport
    };
    let options = eframe::NativeOptions {
        viewport,
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };
    eframe::run_native(
        "Re-Edit PDF",
        options,
        Box::new(move |cc| Ok(Box::new(app::App::new(cc, paths, test)))),
    )
    .map_err(|e| anyhow::anyhow!(e.to_string()))
}
