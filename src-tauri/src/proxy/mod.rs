// 代理服务器入口：启动 axum HTTP/WS 服务器，路由分发到各代理模块
pub mod llm;
pub mod ws;
pub mod consultation;

use axum::{routing::{get, post}, Router};
use tower_http::cors::CorsLayer;

/// 代理服务器共享状态（API Key + 复用的 HTTP 连接池）
#[derive(Clone)]
pub struct AppState {
    pub api_key: String,
    pub http_client: reqwest::Client,
}

pub async fn start_proxy_server(api_key: String) {
    let state = AppState {
        api_key,
        http_client: reqwest::Client::new(), // 只创建一次，所有请求复用连接池
    };
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
        // 问诊数据提交（未来转发给辨证后台）
        .route("/consultation/submit", post(consultation::submit))
        // CORS：允许所有来源（开发时不同端口需要跨域）
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = "127.0.0.1:1420";
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[代理服务器] 端口 {} 被占用: {}，请关闭占用程序后重启应用", addr, e);
            std::process::exit(1);
        }
    };
    println!("[代理服务器] 已启动: http://{}", addr);
    axum::serve(listener, app).await.expect("[代理服务器] 运行异常");
}
