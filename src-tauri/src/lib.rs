mod proxy;
mod ble;

use tauri::Manager;

// 阿里云百炼 API Key（打包进二进制，前端不可见）
const API_KEY: &str = "sk-REDACTED-REMOVED-FOR-SECURITY";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 第二个实例启动时，聚焦已有窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.show();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            ble::ble_scan,
            ble::ble_connect,
            ble::ble_discover,
            ble::ble_write,
            ble::ble_subscribe,
            ble::ble_disconnect,
        ])
        .setup(|app| {
            // 启动本地代理服务器（LLM/ASR/TTS）
            let api_key = API_KEY.to_string();
            tauri::async_runtime::spawn(async move {
                proxy::start_proxy_server(api_key).await;
            });

            // 开发模式下打开 DevTools 方便调试
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
