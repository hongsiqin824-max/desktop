// 代理服务器入口：启动 axum HTTP/WS 服务器，路由分发到各代理模块
pub mod llm;
pub mod ws;

use axum::{routing::{get, post}, Router};
use tower_http::cors::CorsLayer;

pub async fn start_proxy_server(api_key: String) {
    let app = Router::new()
        // LLM HTTP 代理
        .route(
            "/llm-proxy/chat/completions",
            post(llm::proxy_chat),
        )
        // ASR WebSocket 代理（语音识别）
        .route("/asr-proxy", get(ws::proxy_asr))
        // TTS WebSocket 代理（护士 - Cherry 音色）
        .route("/tts-proxy", get(ws::proxy_tts_nurse))
        // TTS WebSocket 代理（医生 - 自定义音色）
        .route("/tts-vc-proxy", get(ws::proxy_tts_doctor))
        // CORS：允许所有来源（开发时不同端口需要跨域）
        .layer(CorsLayer::permissive())
        .with_state(api_key);

    let addr = "127.0.0.1:1420";
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("[代理服务器] 端口 1420 被占用，请关闭占用程序后重试");
    println!("[代理服务器] 已启动: http://{}", addr);
    axum::serve(listener, app).await.expect("[代理服务器] 运行异常");
}
