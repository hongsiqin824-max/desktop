// 认证代理模块：验证码获取 + 登录 + Cookie 自动管理
// 核心设计：Rust 代理内部维护 JSESSIONID，前端无需手动管理 Cookie
//
// 流程：
// 1. /verifyCode → 后端创建 session → Rust 自动存储 JSESSIONID
// 2. /doLogin    → Rust 自动带上 JSESSIONID → 后端验证验证码 → 登录成功
// 3. /questionModel/* → Rust 自动带上 JSESSIONID → 后端验证身份 → 返回数据

use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::Value;
use std::collections::HashMap;

use super::AppState;

/// 后端基础地址
const BACKEND_BASE: &str = "http://39.106.163.181:8092";

// ── 验证码获取 ──────────────────────────────────────────
// GET /verifyCode
// 后端返回图片二进制流 + Set-Cookie: JSESSIONID=xxx
// Rust 代理：返回图片给前端 + 自动存储 JSESSIONID 供后续接口使用

pub async fn verify_code(
    State(state): State<AppState>,
) -> Result<Response, (StatusCode, String)> {
    let url = format!("{}/verifyCode", BACKEND_BASE);
    println!("[认证代理] GET {}", url);

    // 如果已有 JSESSIONID，带上它（保持同一 session）
    let mut req = state.http_client.get(&url);
    let session = state.jsessionid.lock().await;
    if let Some(ref sid) = *session {
        req = req.header("Cookie", format!("JSESSIONID={}", sid));
    }
    drop(session);

    let resp = req.send().await.map_err(|e| {
        eprintln!("[认证代理] 请求验证码失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("后端连接失败: {}", e))
    })?;

    // 从 Set-Cookie 中提取 JSESSIONID 并存储
    if let Some(cookie_val) = resp.headers().get("set-cookie") {
        if let Ok(cookie_str) = cookie_val.to_str() {
            if let Some(sid) = extract_jsession_id(cookie_str) {
                let mut session = state.jsessionid.lock().await;
                *session = Some(sid);
                println!("[认证代理] 已存储 JSESSIONID（来自 verifyCode）");
            }
        }
    }

    // 将图片二进制流原样返回给前端
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| {
        eprintln!("[认证代理] 读取验证码图片失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("读取图片失败: {}", e))
    })?;

    Ok((
        [(axum::http::header::CONTENT_TYPE, content_type)],
        Bytes::from(bytes),
    )
        .into_response())
}

// ── 登录 ────────────────────────────────────────────────
// POST /doLogin
// 前端发送 x-www-form-urlencoded（username, password, code）
// Rust 代理：自动带上 JSESSIONID（确保与验证码同一 session）→ 转发后端
// 后端验证通过后返回 Set-Cookie → Rust 更新 JSESSIONID → 注入到 JSON 响应体

pub async fn do_login(
    State(state): State<AppState>,
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, String)> {
    let url = format!("{}/doLogin", BACKEND_BASE);
    println!("[认证代理] POST {}", url);

    // 带上已存储的 JSESSIONID（和验证码同一个 session）
    let mut req = state
        .http_client
        .post(&url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body.to_vec());

    let session = state.jsessionid.lock().await;
    if let Some(ref sid) = *session {
        req = req.header("Cookie", format!("JSESSIONID={}", sid));
        println!("[认证代理] 带上 JSESSIONID 发送登录请求");
    }
    drop(session);

    let resp = req.send().await.map_err(|e| {
        eprintln!("[认证代理] 登录请求失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("后端连接失败: {}", e))
    })?;

    // 提取并更新 JSESSIONID（后端可能在登录成功后刷新 session）
    if let Some(cookie_val) = resp.headers().get("set-cookie") {
        if let Ok(cookie_str) = cookie_val.to_str() {
            if let Some(sid) = extract_jsession_id(cookie_str) {
                let mut session = state.jsessionid.lock().await;
                *session = Some(sid);
                println!("[认证代理] 已更新 JSESSIONID（来自 doLogin）");
            }
        }
    }

    let text = resp.text().await.map_err(|e| {
        eprintln!("[认证代理] 读取登录响应失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("读取响应失败: {}", e))
    })?;

    // 解析后端 JSON 响应
    let mut json: Value = serde_json::from_str(&text).map_err(|e| {
        eprintln!("[认证代理] 登录响应 JSON 解析失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("JSON 解析失败: {}", e))
    })?;

    // 将 JSESSIONID 注入到响应体中（Tauri 模式下前端需要这个值）
    let session = state.jsessionid.lock().await;
    if let Some(ref sid) = *session {
        json["jsessionId"] = Value::String(sid.clone());
    }
    drop(session);

    Ok(Json(json))
}

// ── 问卷模型接口代理（需要认证）──────────────────────────
// GET /questionModel/{*path}?query_params...
// 前端请求 → Rust 代理自动带上 JSESSIONID → 后端验证身份 → 返回 JSON
// 注意：axum 的 {*path} 只捕获路径，不包含 ? 后的查询参数
//       需要通过 Query 提取器单独获取查询参数并拼接到转发 URL

pub async fn proxy_question_model(
    State(state): State<AppState>,
    Path(path): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    // 拼接基础 URL
    let base_url = if path.is_empty() {
        format!("{}/questionModel", BACKEND_BASE)
    } else {
        format!("{}/questionModel/{}", BACKEND_BASE, path)
    };

    // 将查询参数重新拼接到 URL（axum 的 {*path} 不包含查询参数，需手动恢复）
    let url = if params.is_empty() {
        base_url
    } else {
        let query_string = serde_urlencoded::to_string(&params)
            .unwrap_or_default();
        format!("{}?{}", base_url, query_string)
    };
    println!("[认证代理] GET {}", url);

    // 读取 JSESSIONID（必须已登录）
    let session = state.jsessionid.lock().await;
    let cookie = match session.as_ref() {
        Some(sid) => format!("JSESSIONID={}", sid),
        None => {
            drop(session);
            return Err((
                StatusCode::UNAUTHORIZED,
                "未登录，请先调用 /doLogin 获取 session".to_string(),
            ));
        }
    };
    drop(session);

    let resp = state
        .http_client
        .get(&url)
        .header("Cookie", cookie)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[认证代理] 请求问卷模型失败: {}", e);
            (StatusCode::BAD_GATEWAY, format!("后端连接失败: {}", e))
        })?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| {
        (StatusCode::BAD_GATEWAY, format!("读取响应失败: {}", e))
    })?;

    if !status.is_success() {
        eprintln!("[认证代理] 后端返回错误 {}: {}", status, text);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            text,
        ));
    }

    let json: Value = serde_json::from_str(&text).map_err(|e| {
        (StatusCode::BAD_GATEWAY, format!("JSON 解析失败: {}", e))
    })?;

    Ok(Json(json))
}

// ── 工具函数 ────────────────────────────────────────────

/// 从 Set-Cookie 头中提取 JSESSIONID 的值
fn extract_jsession_id(cookie_str: &str) -> Option<String> {
    cookie_str
        .split(';')
        .find_map(|part| {
            let trimmed = part.trim();
            if trimmed.starts_with("JSESSIONID=") {
                Some(trimmed["JSESSIONID=".len()..].to_string())
            } else {
                None
            }
        })
}
