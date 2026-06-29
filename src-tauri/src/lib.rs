mod proxy;
mod ble;

use tauri::Manager;

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
            // Windows WebView2：授权摄像头/麦克风权限
            // wry 只自动处理剪贴板权限，摄像头/麦克风需要手动授权
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.with_webview(|webview| {
                        unsafe {
                            let webview2 = webview.controller().CoreWebView2().unwrap();
                            let mut token: i64 = 0;
                            let handler = webview2_com::PermissionRequestedEventHandler::create(
                                Box::new(|_, args| {
                                    let Some(args) = args else { return Ok(()) };
                                    let mut kind = webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PERMISSION_KIND::default();
                                    args.PermissionKind(&mut kind)?;
                                    if kind == webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PERMISSION_KIND_CAMERA
                                        || kind == webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                                    {
                                        args.SetState(webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                                    }
                                    Ok(())
                                }),
                            );
                            let _ = webview2.add_PermissionRequested(&handler, &mut token);
                        }
                    });
                }
            }

            // 启动本地代理服务器（LLM/ASR/TTS）— 从环境变量读取敏感配置
            let config = proxy::ProxyConfig::from_env();
            tauri::async_runtime::spawn(async move {
                proxy::start_proxy_server(config).await;
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
