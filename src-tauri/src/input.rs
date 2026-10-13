#[cfg(windows)]
pub fn configure(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::{Emitter, Manager};
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{ICoreWebView2Settings3, ICoreWebView2Settings5},
        ZoomFactorChangedEventHandler,
    };
    use windows::core::Interface;
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let app = app.clone();
    window.with_webview(move |webview| unsafe {
        let result = (|| -> windows::core::Result<()> {
            let controller = webview.controller();
            controller.SetZoomFactor(1.)?;
            let settings = controller.CoreWebView2()?.Settings()?;
            // Keep native precision-touchpad pinch enabled and translate its zoom
            // into document zoom; disabling this also suppressed real gestures.
            settings.SetIsZoomControlEnabled(true)?;
            settings
                .cast::<ICoreWebView2Settings3>()?
                .SetAreBrowserAcceleratorKeysEnabled(false)?;
            settings
                .cast::<ICoreWebView2Settings5>()?
                .SetIsPinchZoomEnabled(true)?;
            let changing = std::rc::Rc::new(std::cell::Cell::new(false));
            let handle = app.clone();
            let handler = ZoomFactorChangedEventHandler::create(Box::new(move |sender, _| {
                if changing.get() {
                    return Ok(());
                }
                let Some(controller) = sender else {
                    return Ok(());
                };
                let mut factor = 1.;
                controller.ZoomFactor(&mut factor)?;
                if (factor - 1f64).abs() < 0.0001 {
                    return Ok(());
                }
                changing.set(true);
                let reset = controller.SetZoomFactor(1.);
                changing.set(false);
                reset?;
                if factor.is_finite() && factor > 0. {
                    let _ = handle.emit("input:pinch", factor);
                }
                Ok(())
            }));
            let mut token = 0;
            controller.add_ZoomFactorChanged(&handler, &mut token)?;
            Ok(())
        })();
        if let Err(error) = result {
            let _ = app.emit(
                "desktop:error",
                format!("Input configuration failed: {error}"),
            );
        }
    })
}
#[cfg(not(windows))]
pub fn configure(_: &tauri::AppHandle) -> tauri::Result<()> {
    Ok(())
}

#[tauri::command]
pub async fn reset_page_scale(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tauri::Manager;
        use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
        use windows::core::w;
        let window = app.get_webview_window("main").ok_or("Missing window")?;
        let (send, receive) = std::sync::mpsc::channel();
        window
            .with_webview(move |view| unsafe {
                let failure = send.clone();
                let callback = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |result, _| {
                        let _ = send.send(result.map_err(|e| e.to_string()));
                        Ok(())
                    },
                ));
                if let Err(error) = view.controller().CoreWebView2().and_then(|v| {
                    v.CallDevToolsProtocolMethod(
                        w!("Emulation.setPageScaleFactor"),
                        w!("{\"pageScaleFactor\":1}"),
                        &callback,
                    )
                }) {
                    let _ = failure.send(Err(error.to_string()));
                }
            })
            .map_err(|e| e.to_string())?;
        return tauri::async_runtime::spawn_blocking(move || {
            receive
                .recv_timeout(std::time::Duration::from_secs(5))
                .map_err(|e| e.to_string())?
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Ok(())
    }
}
