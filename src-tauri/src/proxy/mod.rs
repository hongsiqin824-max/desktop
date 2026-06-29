// 代理服务器入口：启动 axum HTTP/WS 服务器，路由分发到各代理模块
pub mod llm;
pub mod ws;
pub mod consultation;
pub mod business;
pub mod auth;
pub mod tongue_ai;

use axum::{routing::{get, post}, Router, extract::DefaultBodyLimit};
use tower_http::cors::CorsLayer;
use std::sync::Arc;
use tokio::sync::Mutex;

/// 代理服务器共享状态（API Key + HTTP 连接池 + 认证 Cookie + 上游地址）
#[derive(Clone)]
pub struct AppState {
    pub api_key: String,
    pub backend_url: String,
    pub tongue_ai_url: String,
    pub http_client: reqwest::Client,
    /// 后端登录会话 Cookie（verifyCode 时自动捕获，doLogin/questionModel 自动携带）
    pub jsessionid: Arc<Mutex<Option<String>>>,
}

/// 代理服务器配置（从环境变量读取）
pub struct ProxyConfig {
    pub api_key: String,
    pub backend_url: String,
    pub tongue_ai_url: String,
}

impl ProxyConfig {
    /// 从环境变量加载配置，缺失时 panic 并提示需要设置哪些变量
    pub fn from_env() -> Self {
        let api_key = std::env::var("DASHSCOPE_API_KEY")
            .expect("❌ 缺少环境变量 DASHSCOPE_API_KEY（阿里云百炼 API Key）");
        let backend_url = std::env::var("BACKEND_BASE_URL")
            .unwrap_or_else(|_| "http://39.106.163.181:8092".to_string());
        let tongue_ai_url = std::env::var("TONGUE_AI_URL")
            .unwrap_or_else(|_| "https://aitongue.maizhiyu.com".to_string());
        Self { api_key, backend_url, tongue_ai_url }
    }
}

pub async fn start_proxy_server(config: ProxyConfig) {
    let state = AppState {
        api_key: config.api_key,
        backend_url: config.backend_url,
        tongue_ai_url: config.tongue_ai_url,
        http_client: reqwest::Client::new(), // 只创建一次，所有请求复用连接池
        jsessionid: Arc::new(Mutex::new(None)), // 认证 Cookie，verifyCode 时自动捕获
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
        // 后端业务接口通用代理（/mp/* → BACKEND_BASE_URL）
        // GET:  查询类接口（如 getDigitalHumanQuestionsByModel）
        // POST: 写入类接口（如 saveDigitalHumanTonguePulseAnswers, newDigitalHumanSession）
        .route("/mp/{*path}", get(business::proxy_get).post(business::proxy_post))
        // 答案保存接口（/answersheet/* → BACKEND_BASE_URL）
        .route("/answersheet/{*path}", get(business::proxy_get).post(business::proxy_post_answersheet))
        // ── 认证接口代理（验证码 + 登录 + 问卷模型）──
        .route("/verifyCode", get(auth::verify_code))
        .route("/doLogin", post(auth::do_login))
        .route("/questionModel/{*path}", get(auth::proxy_question_model))
        // ── 第三方舌象 AI 代理（TONGUE_AI_URL）──
        // uploadImage 接收 multipart 上传，需要解除 2MB 默认 body 限制
        .route(
            "/tongue-ai/uploadImage",
            post(tongue_ai::proxy_upload_image).layer(DefaultBodyLimit::disable()),
        )
        .route("/tongue-ai/getReport", post(tongue_ai::proxy_get_report))
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
