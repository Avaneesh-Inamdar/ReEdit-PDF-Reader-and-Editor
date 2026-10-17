//! Explicitly enabled local harness. These IPC commands do not exist in release builds.
use anyhow::{Context, Result, ensure};
use tauri::{AppHandle, Manager};

fn output() -> Result<std::path::PathBuf> {
    let path = std::env::var_os("REEDIT_TEST_OUTPUT")
        .context("Set REEDIT_TEST_OUTPUT for the local harness")?;
    let path = std::path::PathBuf::from(path);
    ensure!(
        path.is_absolute(),
        "Test output must be an absolute directory"
    );
    std::fs::create_dir_all(&path)?;
    Ok(path)
}
#[tauri::command]
pub fn desktop_test_output() -> Result<String, String> {
    output()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn desktop_test_sessions(app: AppHandle) -> usize {
    app.state::<crate::printing_session::Sessions>().count()
}
#[tauri::command]
pub async fn desktop_test_update_download(app: AppHandle) -> Result<serde_json::Value, String> {
    use std::io::{Read, Write};
    use tauri_plugin_updater::UpdaterExt;
    let directory = output().map_err(|e| e.to_string())?;
    let bytes = std::fs::read(directory.join("update-fixture.bin")).map_err(|e| e.to_string())?;
    let signature = std::fs::read_to_string(directory.join("update-fixture.bin.sig"))
        .map_err(|e| e.to_string())?;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    let altered = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let tampered = altered.clone();
    let length = bytes.len();
    let manifest=serde_json::json!({"version":"99.0.0","notes":"Local signature verification fixture","platforms":{"test":{"url":format!("http://{address}/asset"),"signature":signature.trim()}}}).to_string();
    std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
        let mut requests = 0;
        while std::time::Instant::now() < deadline && requests < 3 {
            match listener.accept() {
                Ok((mut socket, _)) => {
                    requests += 1;
                    let _ = socket.set_read_timeout(Some(std::time::Duration::from_secs(2)));
                    let mut request = [0; 8192];
                    let read = socket.read(&mut request).unwrap_or(0);
                    let is_manifest =
                        String::from_utf8_lossy(&request[..read]).starts_with("GET /manifest ");
                    let mut body = if is_manifest {
                        manifest.as_bytes().to_vec()
                    } else {
                        bytes.clone()
                    };
                    if !is_manifest && tampered.load(std::sync::atomic::Ordering::Acquire) {
                        body[0] ^= 1;
                    }
                    let header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: {}\r\nConnection: close\r\n\r\n",
                        body.len(),
                        if is_manifest {
                            "application/json"
                        } else {
                            "application/octet-stream"
                        }
                    );
                    let _ = socket.write_all(header.as_bytes());
                    let _ = socket.write_all(&body);
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(5))
                }
                Err(_) => break,
            }
        }
    });
    let updater = app
        .updater_builder()
        .target("test")
        .endpoints(vec![format!("http://{address}/manifest").parse().unwrap()])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Fixture update was not detected")?;
    let verified = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    altered.store(true, std::sync::atomic::Ordering::Release);
    let rejected = update.download(|_, _| {}, || {}).await.is_err();
    Ok(
        serde_json::json!({"signedDownloadVerified":verified.len()==length,"tamperedDownloadRejected":rejected,"installerWasRun":false}),
    )
}

#[tauri::command]
pub fn desktop_test_reopen(app: AppHandle) -> Result<(), String> {
    let state = app.state::<crate::state::DesktopState>();
    let path = state
        .current
        .lock()
        .unwrap()
        .clone()
        .ok_or("No fixture is open")?;
    let path = state
        .readable(std::path::Path::new(&path))
        .map_err(|e| e.to_string())?;
    state.open(&app, &path).map_err(|e| e.to_string())
}
#[cfg(windows)]
#[tauri::command]
pub async fn desktop_test_input(
    app: AppHandle,
    method: String,
    params: serde_json::Value,
) -> Result<String, String> {
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::PCWSTR;
    if !matches!(
        method.as_str(),
        "Input.dispatchMouseEvent"
            | "Input.dispatchKeyEvent"
            | "Input.synthesizePinchGesture"
            | "HeapProfiler.collectGarbage"
            | "Runtime.getHeapUsage"
    ) {
        return Err("Unknown input test method".into());
    }
    let (send, receive) = std::sync::mpsc::channel();
    let window = app
        .get_webview_window("main")
        .ok_or("Missing test window")?;
    window
        .with_webview(move |view| unsafe {
            let failure = send.clone();
            let method: Vec<_> = method.encode_utf16().chain(Some(0)).collect();
            let json = serde_json::to_string(&params).unwrap();
            let params: Vec<_> = json.encode_utf16().chain(Some(0)).collect();
            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |result, json| {
                    let _ = send.send(result.map(|_| json).map_err(|e| e.to_string()));
                    Ok(())
                },
            ));
            if let Err(error) = view.controller().CoreWebView2().and_then(|v| {
                v.CallDevToolsProtocolMethod(
                    PCWSTR(method.as_ptr()),
                    PCWSTR(params.as_ptr()),
                    &handler,
                )
            }) {
                let _ = failure.send(Err(error.to_string()));
            }
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        receive
            .recv_timeout(std::time::Duration::from_secs(20))
            .map_err(|e| e.to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(windows)]
#[tauri::command]
pub fn desktop_test_native_zoom(app: AppHandle, factor: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Missing test window")?;
    window
        .with_webview(move |view| unsafe { view.controller().SetZoomFactor(factor).unwrap() })
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn desktop_test_input(
    _app: AppHandle,
    _method: String,
    _params: serde_json::Value,
) -> Result<String, String> {
    Err("Native CDP input is available in the Windows validation harness".into())
}
#[cfg(not(windows))]
#[tauri::command]
pub fn desktop_test_native_zoom(_app: AppHandle, _factor: f64) -> Result<(), String> {
    Err("Native browser zoom validation is available on Windows".into())
}

#[tauri::command]
pub fn desktop_test_result(result: serde_json::Value) -> Result<(), String> {
    (|| -> Result<()> {
        re_edit_pdf_native::engine::atomic_write(
            &output()?.join("result.json"),
            &serde_json::to_vec_pretty(&result)?,
        )?;
        Ok(())
    })()
    .map_err(|e| e.to_string())
}

#[cfg(windows)]
#[tauri::command]
pub async fn desktop_test_snapshot(app: AppHandle, name: String) -> Result<(), String> {
    use webview2_com::{
        CapturePreviewCompletedHandler,
        Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
    };
    use windows::{
        Win32::{
            System::Com::{STGM_CREATE, STGM_SHARE_EXCLUSIVE, STGM_WRITE},
            UI::Shell::SHCreateStreamOnFileEx,
        },
        core::PCWSTR,
    };
    if !matches!(
        name.as_str(),
        "reader" | "print" | "home" | "editing" | "save" | "updates" | "tools"
    ) {
        return Err("Unknown test snapshot".into());
    }
    let path = output()
        .map_err(|e| e.to_string())?
        .join(format!("{name}.png"));
    let window = app
        .get_webview_window("main")
        .ok_or("Missing test window")?;
    let (send, receive) = std::sync::mpsc::channel();
    window
        .with_webview(move |view| unsafe {
            let failure = send.clone();
            let wide: Vec<u16> = path
                .as_os_str()
                .to_string_lossy()
                .encode_utf16()
                .chain(Some(0))
                .collect();
            let result = (|| -> windows::core::Result<()> {
                let stream = SHCreateStreamOnFileEx(
                    PCWSTR(wide.as_ptr()),
                    (STGM_CREATE | STGM_WRITE | STGM_SHARE_EXCLUSIVE).0,
                    0,
                    true,
                    None,
                )?;
                let retained = stream.clone();
                let on_complete = CapturePreviewCompletedHandler::create(Box::new(move |result| {
                    drop(retained);
                    let _ = send.send(result.map_err(|e| e.to_string()));
                    Ok(())
                }));
                // The COM stream is retained by CapturePreview for the asynchronous capture.
                view.controller().CoreWebView2()?.CapturePreview(
                    COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                    &stream,
                    &on_complete,
                )?;
                Ok(())
            })();
            if let Err(error) = result {
                let _ = failure.send(Err(error.to_string()));
            }
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        receive
            .recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|e| e.to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn desktop_test_snapshot(_app: AppHandle, _name: String) -> Result<(), String> {
    Err("Native snapshots are implemented for the Windows test harness".into())
}

pub fn start(window: &tauri::Webview) {
    if std::env::var_os("REEDIT_TEST_OUTPUT").is_some() {
        let script = match std::env::var("REEDIT_TEST_SUITE").as_deref() {
            Ok("updates") => include_str!("../../scripts/tauri-updates.js"),
            Ok("layout-stability") => include_str!("../../scripts/tauri-layout-stability.js"),
            Ok("editing-regression") => include_str!("../../scripts/tauri-editing-regression.js"),
            Ok("ocr-recognition") => include_str!("../../scripts/tauri-ocr-recognition.js"),
            Ok("interactions") => include_str!("../../scripts/tauri-interactions.js"),
            Ok("fonts-dialog") => include_str!("../../scripts/tauri-fonts-dialog.js"),
            Ok("ocr-edit") => include_str!("../../scripts/tauri-ocr-edit.js"),
            Ok("linux-smoke") => include_str!("../../scripts/tauri-linux-smoke.js"),
            _ => include_str!("../../scripts/tauri-smoke.js"),
        };
        let _ = window.eval(script);
    }
}
