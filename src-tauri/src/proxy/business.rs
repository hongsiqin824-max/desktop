// 后端业务接口通用代理：将 /mp/* 请求透传到后端服务器
// 前端 → Rust 代理 → 后端 (BACKEND_BASE_URL) → 原样返回
//
// 支持 GET 和 POST 两种方法：
//   - GET:  用于 getDigitalHumanQuestionsByModel（获取舌脉问题列表）
//   - POST: 用于 saveDigitalHumanTonguePulseAnswers（保存舌脉答案）等
//
// 两种方法都会自动注入 JSESSIONID Cookie（登录后获取的会话标识）

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde_json::Value;
use std::collections::HashMap;

use super::AppState;

// ── GET 代理 ────────────────────────────────────────────────────
// 用于：getDigitalHumanQuestionsByModel 等查询类接口
// GET /mp/{*path}?query_params...
// 注意：axum 的 {*path} 不包含 ? 后的查询参数，需通过 Query 提取器单独获取

pub async fn proxy_get(
    State(state): State<AppState>,
    Path(path): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    // 拼接 URL（包含路径 + 查询参数）
    let upstream = &state.backend_url;
    let base_url = format!("{}/mp/{}", upstream, path);
    let url = if params.is_empty() {
        base_url
    } else {
        let query_string = serde_urlencoded::to_string(&params).unwrap_or_default();
        format!("{}?{}", base_url, query_string)
    };

    println!("[业务代理] GET {}", url);

    // 构建请求并注入 JSESSIONID Cookie
    let mut req = state.http_client.get(&url);
    let session = state.jsessionid.lock().await;
    if let Some(ref sid) = *session {
        req = req.header("Cookie", format!("JSESSIONID={}", sid));
    }
    drop(session);

    let resp = req.send().await.map_err(|e| {
        eprintln!("[业务代理] 请求后端失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("后端连接失败: {}", e))
    })?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| {
        eprintln!("[业务代理] 读取响应失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("读取响应失败: {}", e))
    })?;

    if !status.is_success() {
        eprintln!("[业务代理] 后端返回错误 {}: {}", status, text);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            text,
        ));
    }

    let json: Value = serde_json::from_str(&text).map_err(|e| {
        eprintln!("[业务代理] JSON 解析失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("JSON 解析失败: {}", e))
    })?;

    Ok(Json(json))
}

// ── POST 代理 ───────────────────────────────────────────────────
// 用于：saveDigitalHumanTonguePulseAnswers、newDigitalHumanSession 等
// POST /mp/{*path}
// 请求体：JSON → 原样转发到后端

pub async fn proxy_post(
    State(state): State<AppState>,
    Path(path): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let upstream = &state.backend_url;
    let url = format!("{}/mp/{}", upstream, path);

    println!("[业务代理] POST {} → {}", url, upstream);

    // 构建请求并注入 JSESSIONID Cookie
    let mut req = state
        .http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body);

    let session = state.jsessionid.lock().await;
    if let Some(ref sid) = *session {
        req = req.header("Cookie", format!("JSESSIONID={}", sid));
    }
    drop(session);

    let resp = req.send().await.map_err(|e| {
        eprintln!("[业务代理] 请求后端失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("后端连接失败: {}", e))
    })?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| {
        eprintln!("[业务代理] 读取响应失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("读取响应失败: {}", e))
    })?;

    if !status.is_success() {
        eprintln!("[业务代理] 后端返回错误 {}: {}", status, text);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            text,
        ));
    }

    let json: Value = serde_json::from_str(&text).map_err(|e| {
        eprintln!("[业务代理] JSON 解析失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("JSON 解析失败: {}", e))
    })?;

    Ok(Json(json))
}

// ── 答案保存接口专用代理 ──────────────────────────────────────────
// 用于：batchSaveQuestionAnswer 等答案保存接口
// POST /answersheet/{*path}
// 请求体：JSON → 原样转发到后端（保留 /answersheet 前缀）

pub async fn proxy_post_answersheet(
    State(state): State<AppState>,
    Path(path): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let upstream = &state.backend_url;
    let url = format!("{}/answersheet/{}", upstream, path);

    println!("[答案代理] POST {} → {}", url, upstream);

    // 构建请求并注入 JSESSIONID Cookie
    let mut req = state
        .http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body);

    let session = state.jsessionid.lock().await;
    if let Some(ref sid) = *session {
        req = req.header("Cookie", format!("JSESSIONID={}", sid));
    }
    drop(session);

    let resp = req.send().await.map_err(|e| {
        eprintln!("[答案代理] 请求后端失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("后端连接失败: {}", e))
    })?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| {
        eprintln!("[答案代理] 读取响应失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("读取响应失败: {}", e))
    })?;

    if !status.is_success() {
        eprintln!("[答案代理] 后端返回错误 {}: {}", status, text);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            text,
        ));
    }

    let json: Value = serde_json::from_str(&text).map_err(|e| {
        eprintln!("[答案代理] JSON 解析失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("JSON 解析失败: {}", e))
    })?;

    Ok(Json(json))
}
