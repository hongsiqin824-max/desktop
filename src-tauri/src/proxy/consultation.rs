// 问诊数据提交接口：接收前端 payload，未来转发给辨证后台系统
// 当前阶段返回 mock 辨证结果，等辨证后台就绪后替换

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use super::AppState;

// ── 请求类型（对应前端 IBackendPayload）──

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub name: String,
    pub gender: String,
    pub age: Option<u32>,
    pub height: Option<u32>,
    pub weight: Option<u32>,
    pub phone: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "UPPERCASE")]
pub struct TonguePulseCodes {
    pub lmb1: u32,
    pub mbjd: u8,
    pub lxmb: u8,
    pub lhmb: u8,
    pub lsmb: u8,
    pub lwmb: u8,
    pub lsz1: u8,
    pub lsz2: u8,
    pub lsz3: u8,
    pub lsz4: u8,
    pub lsz5: u8,
    pub lsz6: u8,
    pub lsz7: u8,
    pub lsz8: u8,
    pub lsz9: u8,
    pub lsz10: u8,
    pub lsz11: u8,
    pub lsz12: u8,
    pub lsz13: u8,
    pub lsz14: u8,
    pub lsz15: u8,
    pub lsz16: u8,
    pub lsz17: u8,
    pub lsz18: u8,
    pub lsz19: u8,
    pub lsz20: u8,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SelfFeatureCode {
    pub meridian_code: String,
    pub eight_position_code: String,
    pub severity: u8,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationSubmitRequest {
    pub user_info: UserInfo,
    pub main_symptom: String,
    pub severity_level: Option<String>,
    pub tongue_pulse_codes: Option<TonguePulseCodes>,
    pub detail_answer_codes: Vec<String>,
    pub self_feature_codes: Vec<SelfFeatureCode>,
    pub start_time: String,
    pub end_time: String,
}

// ── 响应类型（对应前端 ISyndromeOutput）──

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyndromeResult {
    pub disease_category: String,
    pub main_symptom: String,
    pub main_symptoms: Vec<String>,
    pub syndrome_result: String,
    pub syndrome_detail: String,
    pub illustration: String,
    pub conditioning_plan: Vec<String>,
    pub product_recommendation: Vec<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationSubmitResponse {
    pub success: bool,
    /// 辨证结果。None 时前端降级为 mock 数据
    pub syndrome: Option<SyndromeResult>,
}

// ── Handler ──

pub async fn submit(
    State(_state): State<AppState>,
    Json(payload): Json<ConsultationSubmitRequest>,
) -> Result<Json<ConsultationSubmitResponse>, (axum::http::StatusCode, String)> {
    // 1. 打印日志（开发调试用）
    println!("[问诊提交] 收到数据:");
    println!("  用户: {} ({}, {}岁)", payload.user_info.name, payload.user_info.gender, payload.user_info.age);
    println!("  主症: {}", payload.main_symptom);
    println!("  严重程度: {:?}", payload.severity_level);
    println!("  舌脉代码: {}", if payload.tongue_pulse_codes.is_some() { "有" } else { "无" });
    println!("  详细答案数量: {}", payload.detail_answer_codes.len());
    println!("  自选特征数量: {}", payload.self_feature_codes.len());
    println!("  时间: {} → {}", payload.start_time, payload.end_time);

    // 2. 未来：转发给辨证后台
    // let diagnosis_resp = _state.http_client
    //     .post("https://your-diagnosis-server.com/api/diagnose")
    //     .json(&payload)
    //     .send()
    //     .await
    //     .map_err(|e| (StatusCode::BAD_GATEWAY, format!("辨证后台连接失败: {}", e)))?;
    //
    // let syndrome: SyndromeResult = diagnosis_resp.json().await
    //     .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("辨证结果解析失败: {}", e)))?;
    //
    // Ok(Json(ConsultationSubmitResponse {
    //     success: true,
    //     syndrome: Some(syndrome),
    // }))

    // 3. 当前：返回 syndrome = null，让前端降级使用 mock 数据
    Ok(Json(ConsultationSubmitResponse {
        success: true,
        syndrome: None,
    }))
}
