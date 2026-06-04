// 防止 Windows 上打开控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tcm_consultation_lib::run()
}
