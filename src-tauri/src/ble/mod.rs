// BLE 蓝牙通信模块：脉诊笔设备连接
//
// 提供 5 个 Tauri Command，供前端 JS 垫片调用：
//   ble_scan        → 扫描附近 BLE 设备（过滤 MZY 前缀）
//   ble_connect     → 连接指定设备
//   ble_discover    → 发现 GATT 服务和特征（由前端传入 UUID）
//   ble_write       → 向 Write 特征写入字节
//   ble_subscribe   → 开启 Notify 通知（数据通过 Tauri 事件推送）
//   ble_disconnect  → 断开连接

use btleplug::api::{Central, Characteristic, Manager as _, Peripheral as _, ScanFilter};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures_util::StreamExt;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

// ── 数据结构 ──────────────────────────────────────────────────

/// 扫描到的 BLE 设备
#[derive(Serialize, Clone)]
pub struct BleDevice {
    pub id: String,
    pub name: Option<String>,
}

/// BLE 连接状态（全局共享）
struct BleState {
    adapter: Option<Adapter>,
    peripheral: Option<Peripheral>,
    write_char: Option<Characteristic>,
    notify_char: Option<Characteristic>,
}

impl BleState {
    fn new() -> Self {
        Self {
            adapter: None,
            peripheral: None,
            write_char: None,
            notify_char: None,
        }
    }
}

/// 全局 BLE 状态（线程安全，跨 async 安全）
static BLE: std::sync::LazyLock<Arc<Mutex<BleState>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(BleState::new())));

// ── Tauri Commands ────────────────────────────────────────────

/// 扫描附近的 BLE 设备，返回名称以 "MZY" 开头的设备列表
/// 复用已有 adapter 并在扫描前断开残留连接，防止设备因保持连接而不广播
#[tauri::command]
pub async fn ble_scan() -> Result<Vec<BleDevice>, String> {
    let mut state = BLE.lock().await;

    // ① 如果有残留连接，先断开（BLE 设备在已连接时不广播，必须先断开）
    if let Some(peripheral) = state.peripheral.take() {
        println!("[ble_scan] 断开残留连接...");
        let _ = peripheral.disconnect().await;
    }
    state.write_char = None;
    state.notify_char = None;

    // ② 复用已有 adapter（保持 peripheral 引用有效），没有才新建
    let adapter = match state.adapter.take() {
        Some(a) => {
            println!("[ble_scan] 复用已有 adapter");
            a
        }
        None => {
            println!("[ble_scan] 创建新 adapter");
            let manager = Manager::new().await.map_err(|e| format!("创建 BLE 管理器失败: {e}"))?;
            let adapters = manager.adapters().await.map_err(|e| format!("获取适配器失败: {e}"))?;
            adapters.into_iter().next().ok_or("未找到 BLE 适配器，请确认蓝牙已开启")?
        }
    };

    // 开始扫描（无过滤条件）
    adapter
        .start_scan(ScanFilter::default())
        .await
        .map_err(|e| format!("扫描启动失败: {e}"))?;

    // 等待 5 秒收集设备（从 3 秒增加到 5 秒，给设备更多广播时间）
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

    let peripherals = adapter
        .peripherals()
        .await
        .map_err(|e| format!("获取设备列表失败: {e}"))?;

    // 诊断日志：显示所有扫描到的设备
    println!("[ble_scan] 扫描完成，总共找到 {} 个 BLE 设备", peripherals.len());

    let mut devices = Vec::new();
    for p in &peripherals {
        if let Ok(Some(props)) = p.properties().await {
            let name_str = props.local_name.as_deref().unwrap_or("(无名)");
            println!("[ble_scan]   - 设备: {}, ID: {}", name_str, p.id());

            if let Some(ref name) = props.local_name {
                if name.starts_with("MZY") {
                    devices.push(BleDevice {
                        id: p.id().to_string(),
                        name: Some(name.clone()),
                    });
                }
            }
        }
    }

    println!("[ble_scan] 其中 MZY 设备: {} 个", devices.len());

    // 保存 adapter 引用供后续连接使用
    state.adapter = Some(adapter);

    Ok(devices)
}

/// 连接到指定 BLE 设备
#[tauri::command]
pub async fn ble_connect(device_id: String) -> Result<(), String> {
    let mut state = BLE.lock().await;

    let adapter = state.adapter.as_ref().ok_or("请先执行 ble_scan")?;

    // 从已扫描设备中查找目标设备
    let peripherals = adapter
        .peripherals()
        .await
        .map_err(|e| format!("获取设备列表失败: {e}"))?;

    let target = peripherals
        .into_iter()
        .find(|p| p.id().to_string() == device_id)
        .ok_or(format!("未找到设备: {device_id}"))?;

    // 建立 GATT 连接
    println!("[ble_connect] 正在连接设备: {}", device_id);
    target
        .connect()
        .await
        .map_err(|e| {
            println!("[ble_connect] 连接失败: {e}");
            format!("连接设备失败: {e}")
        })?;

    println!("[ble_connect] ✅ 连接成功");
    state.peripheral = Some(target);
    Ok(())
}

/// 发现 GATT 服务和特征（由前端传入 SDK 使用的 UUID）
#[tauri::command]
pub async fn ble_discover(
    service_uuid: String,
    write_uuid: String,
    notify_uuid: String,
) -> Result<(), String> {
    let mut state = BLE.lock().await;

    let peripheral = state.peripheral.as_ref().ok_or("未连接设备")?;

    // 发现服务和特征
    peripheral
        .discover_services()
        .await
        .map_err(|e| format!("发现服务失败: {e}"))?;

    let svc_uuid = Uuid::parse_str(&service_uuid).map_err(|e| format!("无效的 service UUID: {e}"))?;
    let w_uuid = Uuid::parse_str(&write_uuid).map_err(|e| format!("无效的 write UUID: {e}"))?;
    let n_uuid = Uuid::parse_str(&notify_uuid).map_err(|e| format!("无效的 notify UUID: {e}"))?;

    // 验证服务和特征是否存在
    let characteristics = peripheral.characteristics();
    let write_char = characteristics.iter().find(|c| c.uuid == w_uuid).cloned();
    let notify_char = characteristics.iter().find(|c| c.uuid == n_uuid).cloned();

    if write_char.is_none() || notify_char.is_none() {
        return Err(format!(
            "GATT 特征未找到 (write={}, notify={})。设备服务列表: {:?}",
            write_char.is_some(),
            notify_char.is_some(),
            characteristics.iter().map(|c| c.uuid.to_string()).collect::<Vec<_>>()
        ));
    }

    state.write_char = write_char;
    state.notify_char = notify_char;

    // service_uuid 仅用于验证（btleplug 的 discover_services 已发现所有服务）
    let _ = svc_uuid;

    Ok(())
}

/// 向 Write 特征写入字节数据
#[tauri::command]
pub async fn ble_write(data: Vec<u8>) -> Result<(), String> {
    let state = BLE.lock().await;

    let peripheral = state.peripheral.as_ref().ok_or("未连接设备")?;
    let char = state.write_char.as_ref().ok_or("未执行 ble_discover")?;

    peripheral
        .write(
            char,
            &data,
            btleplug::api::WriteType::WithResponse,
        )
        .await
        .map_err(|e| format!("写入失败: {e}"))?;

    Ok(())
}

/// 开启 Notify 特征的通知，接收到的数据通过 Tauri 事件 "ble-notify" 推送到前端
#[tauri::command]
pub async fn ble_subscribe(app: AppHandle) -> Result<(), String> {
    let state = BLE.lock().await;

    let peripheral = state
        .peripheral
        .as_ref()
        .ok_or("未连接设备")?
        .clone();
    let char = state
        .notify_char
        .as_ref()
        .ok_or("未执行 ble_discover")?
        .clone();
    let notify_uuid = char.uuid;

    // 开启通知
    peripheral
        .subscribe(&char)
        .await
        .map_err(|e| format!("订阅通知失败: {e}"))?;

    // 获取通知数据流
    let mut notifications = peripheral.notifications().await.map_err(|e| format!("获取通知流失败: {e}"))?;

    // 后台任务：持续读取通知数据并推送到前端
    tokio::spawn(async move {
        while let Some(notification) = notifications.next().await {
            if notification.uuid == notify_uuid {
                let _ = app.emit("ble-notify", notification.value);
            }
        }
    });

    Ok(())
}

/// 断开 BLE 连接，清理所有状态
#[tauri::command]
pub async fn ble_disconnect() -> Result<(), String> {
    let mut state = BLE.lock().await;

    if let Some(ref peripheral) = state.peripheral {
        println!("[ble_disconnect] 正在断开连接...");
        let _ = peripheral.disconnect().await;
        println!("[ble_disconnect] ✅ 已断开");
    } else {
        println!("[ble_disconnect] 无活跃连接，跳过");
    }

    // 清理所有状态
    state.peripheral = None;
    state.write_char = None;
    state.notify_char = None;

    Ok(())
}
