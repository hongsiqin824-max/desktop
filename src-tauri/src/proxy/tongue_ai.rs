// 第三方舌象 AI 分析代理：转发请求到舌象 AI 服务 (TONGUE_AI_URL)
//
// Tauri 模式下前端无法直接跨域请求第三方 HTTPS API，
// 需要通过 Rust 代理中转。浏览器开发模式走 Vite 代理，不经过这里。
//
// 路由：
//   POST /tongue-ai/uploadImage  → 转发 multipart 图片上传
//   POST /tongue-ai/getReport    → 转发 JSON 分析请求

use axum::{
    body::Bytes,
    extract::{Multipart, State},
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::Value;

use super::AppState;

// ── 图片上传代理 ────────────────────────────────────────────────
// POST /tongue-ai/uploadImage
//
// 前端发送：
//   - multipart/form-data（只有 file 字段）
//   - HTTP headers（appId, timestamp）
//
// Rust 代理：接收 → 重新组装 → 转发到第三方 → 返回 JSON
//
// 注意事项：
// - axum Multipart 提取器会先接收完整 body 到内存，再转发
// - 舌象照片通常 1-5MB，内存缓冲没有问题
// - DefaultBodyLimit 需要调大（在 mod.rs 中设置）

pub async fn proxy_upload_image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,  // 提取 HTTP headers
    mut multipart: Multipart,
) -> Result<Response, (StatusCode, String)> {
    let upstream = &state.tongue_ai_url;
    let url = format!("{}/api/app/uploadImage", upstream);
    println!("[舌象AI代理] POST {} (multipart 转发)", url);

    // 从 HTTP headers 中提取 appId 和 timestamp
    let app_id = headers
        .get("appid")  // HTTP header 名称不区分大小写，axum 统一转小写
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let timestamp = headers
        .get("timestamp")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if app_id.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "缺少 appId 请求头".to_string()));
    }

    println!("[舌象AI代理] Headers: appId={}, timestamp={}", app_id, timestamp);

    // 从 multipart 中提取文件（只应该有 file 字段）
    let mut form = reqwest::multipart::Form::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("读取 multipart 失败: {}", e)))?
    {
        let name = field
            .name()
            .unwrap_or("unknown")
            .to_string();
        let file_name = field.file_name().map(|s| s.to_string());
        let content_type = field.content_type().unwrap_or("application/octet-stream").to_string();

        let data = field
            .bytes()
            .await
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("读取字段 {} 数据失败: {}", name, e)))?;

        println!("[舌象AI代理] 提取字段: {} ({}, {} bytes)", name, file_name.as_deref().unwrap_or("text"), data.len());

        if let Some(fname) = file_name {
            // 文件字段：保留文件名和内容类型
            let part = reqwest::multipart::Part::bytes(data.to_vec())
                .file_name(fname)
                .mime_str(&content_type)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("构建 multipart Part 失败: {}", e)))?;
            form = form.part(name, part);
        }
        // 忽略非文件字段（appId/timestamp 应该从 headers 获取，不是 form）
    }

    // 转发到第三方 AI 服务，appId 和 timestamp 放在 HTTP headers 中
    let resp = state
        .http_client
        .post(&url)
        .header("appId", HeaderValue::from_str(app_id)
            .map_err(|_| (StatusCode::BAD_REQUEST, "appId 格式无效".to_string()))?)
        .header("timestamp", HeaderValue::from_str(timestamp)
            .map_err(|_| (StatusCode::BAD_REQUEST, "timestamp 格式无效".to_string()))?)
        .multipart(form)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[舌象AI代理] 请求第三方失败: {}", e);
            (StatusCode::BAD_GATEWAY, format!("舌象AI服务连接失败: {}", e))
        })?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| {
        eprintln!("[舌象AI代理] 读取响应失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("读取AI响应失败: {}", e))
    })?;

    if !status.is_success() {
        eprintln!("[舌象AI代理] 第三方返回错误 {}: {}", status, text);
        // 返回包含第三方错误详情的响应
        let error_msg = format!("第三方API返回 {}: {}", status.as_u16(), text);
        return Err((status, error_msg));
    }

    // 原样返回 JSON 给前端
    let json: Value = serde_json::from_str(&text).map_err(|e| {
        eprintln!("[舌象AI代理] JSON 解析失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("AI 响应 JSON 解析失败: {}", e))
    })?;

    println!("[舌象AI代理] 上传成功");
    Ok(Json(json).into_response())
}

// ── 舌象分析报告代理 ────────────────────────────────────────────
// POST /tongue-ai/getReport
//
// 前端发送 JSON body + Header（appId, timestamp）
// Rust 代理：提取 header + body → 转发到第三方 → 返回 JSON
//
// 前端请求格式：
//   headers: { appId: "xxx", timestamp: "123456", Content-Type: "application/json" }
//   body: { age, uurl, phone, sex, name }

pub async fn proxy_get_report(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, String)> {
    let upstream = &state.tongue_ai_url;
    let url = format!("{}/api/app/getReport", upstream);
    println!("[舌象AI代理] POST {} (JSON 转发)", url);

    // 提取前端传递的 appId 和 timestamp 请求头
    let app_id = headers
        .get("appid")  // HTTP 头名称不区分大小写，axum 统一转小写
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let timestamp = headers
        .get("timestamp")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if app_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "缺少 appId 请求头".to_string(),
        ));
    }

    // 转发到第三方，带上 appId 和 timestamp 请求头
    let resp = state
        .http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .header(
            "appId",
            HeaderValue::from_str(app_id)
                .map_err(|_| (StatusCode::BAD_REQUEST, "appId 格式无效".to_string()))?,
        )
        .header(
            "timestamp",
            HeaderValue::from_str(timestamp)
                .map_err(|_| (StatusCode::BAD_REQUEST, "timestamp 格式无效".to_string()))?,
        )
        .body(body.to_vec())
        .send()
        .await
        .map_err(|e| {
            eprintln!("[舌象AI代理] 请求第三方失败: {}", e);
            (StatusCode::BAD_GATEWAY, format!("舌象AI服务连接失败: {}", e))
        })?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| {
        eprintln!("[舌象AI代理] 读取响应失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("读取AI响应失败: {}", e))
    })?;

    if !status.is_success() {
        eprintln!("[舌象AI代理] 第三方返回错误 {}: {}", status, text);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            text,
        ));
    }

    let json: Value = serde_json::from_str(&text).map_err(|e| {
        eprintln!("[舌象AI代理] JSON 解析失败: {}", e);
        (StatusCode::BAD_GATEWAY, format!("AI 响应 JSON 解析失败: {}", e))
    })?;

    println!("[舌象AI代理] 分析报告获取成功");
    Ok(Json(json))
}
