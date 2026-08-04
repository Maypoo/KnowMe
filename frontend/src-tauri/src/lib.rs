use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[derive(Clone, Serialize)]
struct OauthTokens {
    access_token: String,
    refresh_token: String,
    #[serde(rename = "deleteAccount")]
    delete_account: bool,
}

#[tauri::command]
async fn open_google_oauth(app: tauri::AppHandle, url: String, delete_account: bool) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("google-oauth") {
        let _ = existing.set_focus();
        return Ok(());
    }
    let parsed: tauri::Url = match url.parse() {
        Ok(parsed) => parsed,
        Err(_) => return Err(String::from("URL de autenticación inválida")),
    };
    let emitted = Arc::new(AtomicBool::new(false));
    let app_for_nav = app.clone();
    let app_for_close = app.clone();

    let window = WebviewWindowBuilder::new(&app, "google-oauth", WebviewUrl::External(parsed))
        .title("Iniciar sesión con Google")
        .inner_size(520.0, 680.0)
        .center()
        .on_navigation({
            let emitted = emitted.clone();
            move |url| {
                if emitted.load(Ordering::SeqCst) {
                    return false;
                }
                if let Some((access_token, refresh_token)) = url.fragment().and_then(parse_fragment) {
                    emitted.store(true, Ordering::SeqCst);
                    let payload = OauthTokens {
                        access_token,
                        refresh_token,
                        delete_account,
                    };
                    let _ = app_for_nav
                        .get_webview_window("main")
                        .and_then(|w| w.emit("knowme-oauth", payload).ok());
                    let _ = app_for_nav.get_webview_window("google-oauth").and_then(|w| w.close().ok());
                    return false;
                }
                true
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    window.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            if !emitted.load(Ordering::SeqCst) {
                let _ = app_for_close
                    .get_webview_window("main")
                    .and_then(|w| w.emit("knowme-oauth", Option::<OauthTokens>::None).ok());
            }
        }
    });

    Ok(())
}

fn parse_fragment(fragment: &str) -> Option<(String, String)> {
    let mut access_token = None;
    let mut refresh_token = None;
    for pair in fragment.split('&') {
        let mut parts = pair.splitn(2, '=');
        if let (Some(key), Some(value)) = (parts.next(), parts.next()) {
            match key {
                "access_token" => access_token = Some(value.to_string()),
                "refresh_token" => refresh_token = Some(value.to_string()),
                _ => {}
            }
        }
    }
    match (access_token, refresh_token) {
        (Some(access_token), Some(refresh_token)) => Some((access_token, refresh_token)),
        _ => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_google_oauth])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
