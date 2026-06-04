// LLM HTTP 代理：接收前端 POST 请求 → 注入 API Key → 转发到阿里云百炼 → 返回响应

use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde_json::Value;

const LLM_UPSTREAM: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

pub async fn proxy_chat(
    State(api_key): State<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let client = reqwest::Client::new();

    let resp = client
        .post(LLM_UPSTREAM)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[LLM代理] 请求阿里云失败: {}", e);
            (StatusCode::BAD_GATEWAY, format!("上游请求失败: {}", e))
        })?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| {
        eprintln!("[LLM代理] 读取响应失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("读取响应失败: {}", e))
    })?;

    if !status.is_success() {
        eprintln!("[LLM代理] 阿里云返回错误 {}: {}", status, text);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            text,
        ));
    }

    let json: Value = serde_json::from_str(&text).map_err(|e| {
        eprintln!("[LLM代理] JSON 解析失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("JSON 解析失败: {}", e))
    })?;

    Ok(Json(json))
}
