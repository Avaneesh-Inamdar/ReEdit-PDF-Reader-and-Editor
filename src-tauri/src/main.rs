#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod commands;
#[cfg(feature = "desktop-test")]
mod desktop_test;
mod file_browser;
mod input;
mod printing_session;
mod services;
mod state;
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};
fn main() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_updater::Builder::new().build());
    // An opt-in test executable must not forward its fixture into a user's
    // running app. Production retains the normal single-instance behavior.
    #[cfg(not(feature = "desktop-test"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        for p in state::paths(&args, &cwd) {
            if let Err(error) = app.state::<state::DesktopState>().open(app, &p) {
                let _ = app.emit("desktop:error", error.to_string());
            }
        }
    }));
    let builder = builder
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            #[cfg(feature = "desktop-test")]
            let dir = std::env::var_os("REEDIT_TEST_OUTPUT")
                .map(std::path::PathBuf::from)
                .unwrap_or(dir);
            let state = state::DesktopState::load(dir.join("native-settings.json"));
            app.manage(state);
            app.manage(printing_session::Sessions::default());
            input::configure(app.handle())?;
            let args: Vec<_> = std::env::args().collect();
            let cwd = std::env::current_dir()?.to_string_lossy().into_owned();
            for p in state::paths(&args, &cwd) {
                app.state::<state::DesktopState>().open(app.handle(), &p)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let state = window.state::<state::DesktopState>();
                if !state.allow_close.load(Ordering::Acquire) {
                    api.prevent_close();
                    let _ = window.emit("window:closeRequested", ());
                }
            }
            tauri::WindowEvent::Resized(_) => {
                if let Ok(maximized) = window.is_maximized() {
                    let _ = window.emit("window:maximize-changed", maximized);
                }
            }
            _ => {}
        });
    #[cfg(feature = "desktop-test")]
    let builder = builder
        .on_page_load(|window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                desktop_test::start(&window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_pdf,
            file_browser::browse_files,
            file_browser::choose_file,
            file_browser::pick_files_native,
            file_browser::open_chosen_pdf,
            commands::export_word_bytes,
            commands::import_office_bytes,
            commands::pick_pdfs,
            commands::read_pdf,
            commands::save_pdf,
            commands::save_attachment,
            commands::recent_files,
            commands::remove_recent,
            commands::current_path,
            commands::renderer_ready,
            commands::confirm_close,
            commands::force_close,
            commands::restart_app,
            commands::set_title,
            commands::minimize,
            input::reset_page_scale,
            commands::maximize,
            commands::is_maximized,
            commands::request_close,
            commands::remove_pdf_content,
            commands::normalize_font,
            commands::system_fonts,
            commands::read_system_font,
            commands::check_updates,
            commands::open_releases,
            commands::open_default_apps,
            commands::import_office,
            commands::export_word,
            commands::sign_certificate,
            commands::printers,
            commands::print_images,
            commands::print_pdf,
            commands::begin_print,
            commands::preview_print,
            commands::submit_print,
            commands::export_print,
            commands::close_print,
            desktop_test::desktop_test_result,
            desktop_test::desktop_test_output,
            desktop_test::desktop_test_update_download,
            desktop_test::desktop_test_sessions,
            desktop_test::desktop_test_reopen,
            desktop_test::desktop_test_snapshot,
            desktop_test::desktop_test_input,
            desktop_test::desktop_test_native_zoom
        ]);
    #[cfg(not(feature = "desktop-test"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        commands::open_pdf,
        file_browser::browse_files,
        file_browser::choose_file,
        file_browser::pick_files_native,
        file_browser::open_chosen_pdf,
        commands::export_word_bytes,
        commands::import_office_bytes,
        commands::pick_pdfs,
        commands::read_pdf,
        commands::save_pdf,
        commands::save_attachment,
        commands::recent_files,
        commands::remove_recent,
        commands::current_path,
        commands::renderer_ready,
        commands::confirm_close,
        commands::force_close,
        commands::restart_app,
        commands::set_title,
        commands::minimize,
        input::reset_page_scale,
        commands::maximize,
        commands::is_maximized,
        commands::request_close,
        commands::remove_pdf_content,
        commands::normalize_font,
        commands::system_fonts,
        commands::read_system_font,
        commands::check_updates,
        commands::open_releases,
        commands::open_default_apps,
        commands::import_office,
        commands::export_word,
        commands::sign_certificate,
        commands::printers,
        commands::print_images,
        commands::print_pdf,
        commands::begin_print,
        commands::preview_print,
        commands::submit_print,
        commands::export_print,
        commands::close_print
    ]);
    builder
        .run(tauri::generate_context!())
        .expect("Unable to launch Re-Edit PDF");
}
