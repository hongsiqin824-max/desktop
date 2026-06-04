// WebSocket 双向代理：前端 ↔ Rust ↔ 阿里云百炼
// 核心逻辑：建立到阿里云的 WS 连接（注入 Auth Header），双向透传所有帧
// 关键：正确区分文本帧（Text）和二进制帧（Binary），保证 TTS PCM 音频不损坏

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite};

// ── 三个路由入口，各自指向不同的阿里云模型 ──

const ASR_UPSTREAM: &str =
    "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-omni-plus-realtime";
const TTS_NURSE_UPSTREAM: &str =
    "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime";
const TTS_DOCTOR_UPSTREAM: &str =
    "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-vc-realtime-2026-01-15";

pub async fn proxy_asr(
    ws: WebSocketUpgrade,
    State(api_key): State<String>,
) -> Response {
    ws.on_upgrade(move |socket| {
        proxy_ws(socket, api_key, ASR_UPSTREAM, "ASR")
    })
}

pub async fn proxy_tts_nurse(
    ws: WebSocketUpgrade,
    State(api_key): State<String>,
) -> Response {
    ws.on_upgrade(move |socket| {
        proxy_ws(socket, api_key, TTS_NURSE_UPSTREAM, "TTS-护士")
    })
}

pub async fn proxy_tts_doctor(
    ws: WebSocketUpgrade,
    State(api_key): State<String>,
) -> Response {
    ws.on_upgrade(move |socket| {
        proxy_ws(socket, api_key, TTS_DOCTOR_UPSTREAM, "TTS-医生")
    })
}

// ── 核心：WebSocket 双向透传 ──

async fn proxy_ws(
    client_ws: WebSocket,
    api_key: String,
    upstream_url: &str,
    label: &'static str,
) {
    // 1. 建立到阿里云的 WebSocket 连接（注入 Authorization 头）
    // 使用 tungstenite::http::Request::builder() 构建，与 connect_async 共享同一 http crate
    let request = tungstenite::http::Request::builder()
        .method("GET")
        .uri(upstream_url)
        .header("Host", "dashscope.aliyuncs.com")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", tungstenite::handshake::client::generate_key())
        .header("Authorization", format!("Bearer {}", api_key))
        .body(())
        .unwrap();

    let (upstream_ws, _) = match connect_async(request).await {
        Ok(conn) => conn,
        Err(e) => {
            eprintln!("[{}] 连接阿里云失败: {}", label, e);
            return;
        }
    };
    println!("[{}] 已连接到阿里云", label);

    // 2. 拆分双向流
    let (mut client_sink, mut client_stream) = client_ws.split();
    let (mut upstream_sink, mut upstream_stream) = upstream_ws.split();

    // 3. 客户端 → 阿里云（axum/tungstenite 类型不同，需通过 String/Vec 中转）
    let label_c2u = label;
    let client_to_upstream = tokio::spawn(async move {
        while let Some(msg) = client_stream.next().await {
            match msg {
                Ok(Message::Text(t)) => {
                    let s: String = t.to_string();
                    if upstream_sink.send(tungstenite::Message::Text(s.into())).await.is_err() {
                        break;
                    }
                }
                Ok(Message::Binary(b)) => {
                    let v: Vec<u8> = b.to_vec();
                    if upstream_sink.send(tungstenite::Message::Binary(v.into())).await.is_err() {
                        break;
                    }
                }
                Ok(Message::Close(_)) => {
                    let _ = upstream_sink.send(tungstenite::Message::Close(None)).await;
                    break;
                }
                Ok(Message::Ping(d)) => {
                    let v: Vec<u8> = d.to_vec();
                    let _ = upstream_sink.send(tungstenite::Message::Ping(v.into())).await;
                }
                Ok(Message::Pong(d)) => {
                    let v: Vec<u8> = d.to_vec();
                    let _ = upstream_sink.send(tungstenite::Message::Pong(v.into())).await;
                }
                Err(_) => break,
            }
        }
        println!("[{}] 客户端连接已关闭", label_c2u);
    });

    // 4. 阿里云 → 客户端（tungstenite → axum，同样通过 String/Vec 中转）
    let label_u2c = label;
    let upstream_to_client = tokio::spawn(async move {
        while let Some(msg) = upstream_stream.next().await {
            match msg {
                Ok(tungstenite::Message::Text(t)) => {
                    let s: String = t.to_string();
                    if client_sink.send(Message::Text(s.into())).await.is_err() {
                        break;
                    }
                }
                Ok(tungstenite::Message::Binary(b)) => {
                    let v: Vec<u8> = b.to_vec();
                    if client_sink.send(Message::Binary(v.into())).await.is_err() {
                        break;
                    }
                }
                Ok(tungstenite::Message::Close(_)) => {
                    let _ = client_sink.send(Message::Close(None)).await;
                    break;
                }
                Ok(tungstenite::Message::Ping(d)) => {
                    let v: Vec<u8> = d.to_vec();
                    let _ = client_sink.send(Message::Ping(v.into())).await;
                }
                Ok(tungstenite::Message::Pong(d)) => {
                    let v: Vec<u8> = d.to_vec();
                    let _ = client_sink.send(Message::Pong(v.into())).await;
                }
                // tungstenite 内部使用的 Frame 变体，无需转发给客户端
                Ok(tungstenite::Message::Frame(_)) => {}
                Err(_) => break,
            }
        }
        println!("[{}] 阿里云连接已关闭", label_u2c);
    });

    // 5. 等待任一方关闭
    let _ = tokio::join!(client_to_upstream, upstream_to_client);
    println!("[{}] 代理会话结束", label);
}
