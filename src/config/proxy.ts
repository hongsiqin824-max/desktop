/**
 * Tauri 代理服务器配置
 * Rust 代理服务器端口，所有前端连接都通过此配置获取
 */

/** 是否在 Tauri 桌面环境运行（兼容 SSR/Node 环境） */
export const isTauri = typeof window !== 'undefined' && !!window.__TAURI__

/** Tauri 模式下 Rust 代理服务器的端口 */
export const PROXY_PORT = 1420

/** Tauri 模式下的 HTTP 基础地址 */
export const PROXY_HTTP_BASE = `http://localhost:${PROXY_PORT}`

/** Tauri 模式下的 WebSocket 基础地址 */
export const PROXY_WS_BASE = `ws://localhost:${PROXY_PORT}`
