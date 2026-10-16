use std::{fs, sync::atomic::{AtomicBool, Ordering}, thread, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder, Emitter, Manager};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
mod history;
mod cloud;
mod local_data;

struct DesktopLayer(AtomicBool);

#[cfg(windows)]
#[link(name = "user32")]
unsafe extern "system" {
    fn SetWindowPos(hwnd: isize, insert_after: isize, x: i32, y: i32, width: i32, height: i32, flags: u32) -> i32;
    fn GetShellWindow() -> isize;
    fn FindWindowW(class_name: *const u16, title: *const u16) -> isize;
    fn ShowWindow(hwnd: isize, command: i32) -> i32;
    fn SetForegroundWindow(hwnd: isize) -> i32;
}

#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateMutexW(attributes: *const std::ffi::c_void, initial_owner: i32, name: *const u16) -> isize;
    fn CloseHandle(handle: isize) -> i32;
}

#[cfg(windows)]
fn claim_single_instance() -> Option<isize> {
    let name: Vec<u16> = "Local\\FocusMatrix_com_focusmatrix_desktop\0".encode_utf16().collect();
    let mutex = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    if mutex == 0 { return Some(0); }
    if std::io::Error::last_os_error().raw_os_error() != Some(183) { return Some(mutex); }
    unsafe { CloseHandle(mutex); }
    let title: Vec<u16> = "Focus Matrix\0".encode_utf16().collect();
    for _ in 0..20 {
        let existing = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
        if existing != 0 {
            unsafe { ShowWindow(existing, 9); SetForegroundWindow(existing); }
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    None
}

#[cfg(windows)]
fn set_window_layer(hwnd: isize, bottom: bool) -> Result<(), String> {
    // Remove any stale topmost style before changing the normal Z-order.
    // HWND_BOTTOM stays just above the Explorer desktop window on Windows.
    const FLAGS: u32 = 0x0001 | 0x0002 | 0x0010 | 0x0200;
    if unsafe { SetWindowPos(hwnd, -2, 0, 0, 0, 0, FLAGS) } == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let result = unsafe { SetWindowPos(hwnd, if bottom { 1 } else { 0 }, 0, 0, 0, 0, FLAGS) };
    if result == 0 { Err(std::io::Error::last_os_error().to_string()) } else { Ok(()) }
}

#[tauri::command]
fn set_desktop_layer(window: tauri::WebviewWindow, state: tauri::State<'_, DesktopLayer>, enabled: bool) -> Result<(), String> {
    state.0.store(enabled, Ordering::Relaxed);
    #[cfg(windows)]
    { set_window_layer(window.hwnd().map_err(|error| error.to_string())?.0 as isize, enabled) }
    #[cfg(not(windows))]
    { let _ = window; Ok(()) }
}

#[tauri::command]
fn backup_corrupt_store(app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let source = data_dir.join("focus-matrix.json");
    if source.exists() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_secs();
        let target = data_dir.join(format!("focus-matrix.corrupt-{stamp}.json"));
        fs::rename(source, target).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    let _ = app.save_window_state(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED);
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    let Some(_instance_mutex) = claim_single_instance() else { return; };
    let launched_at_login = std::env::args().any(|arg| arg == "--autostart");
    tauri::Builder::default()
        .manage(DesktopLayer(AtomicBool::new(false)))
        .manage(history::HistoryState::default())
        .manage(cloud::CloudState::default())
        .manage(local_data::LocalDataState::default())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default()
            .with_state_flags(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED)
            .build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![backup_corrupt_store, quit_app, set_desktop_layer,
            local_data::read_local_data, local_data::commit_local_data, local_data::read_update_request, local_data::finish_update_prepare, local_data::ack_update_restore,
            history::save_content_version, history::list_content_versions, history::get_content_version,
            cloud::get_cloud_status, cloud::configure_cloud, cloud::sync_cloud, cloud::set_cloud_sharing, cloud::rotate_cloud_link, cloud::ack_cloud_applied, cloud::set_share_editing, cloud::create_mobile_pairing, cloud::list_mobile_devices, cloud::revoke_mobile_device, cloud::get_cloud_changes])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(false) = event {
                if window.app_handle().state::<DesktopLayer>().0.load(Ordering::Relaxed) {
                    #[cfg(windows)]
                    if let Ok(hwnd) = window.hwnd() { let _ = set_window_layer(hwnd.0 as isize, true); }
                }
            }
        })
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                window.unminimize()?;
                window.show()?;
                if launched_at_login {
                    thread::spawn(move || {
                        #[cfg(windows)]
                        for _ in 0..20 {
                            if unsafe { GetShellWindow() } != 0 { break; }
                            thread::sleep(Duration::from_millis(250));
                        }
                        thread::sleep(Duration::from_millis(500));
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                        if window.app_handle().state::<DesktopLayer>().0.load(Ordering::Relaxed) {
                            #[cfg(windows)]
                            if let Ok(hwnd) = window.hwnd() { let _ = set_window_layer(hwnd.0 as isize, true); }
                        }
                    });
                }
            }
            let show = MenuItem::with_id(app, "show", "显示 Focus Matrix", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏 Focus Matrix", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &settings, &quit])?;
            let icon = app.default_window_icon().expect("window icon missing").clone();
            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let Some(window) = app.get_webview_window("main") else { return; };
                    match event.id.as_ref() {
                        "show" => { let _ = window.show(); let _ = window.set_focus(); }
                        "hide" => { let _ = window.hide(); }
                        "settings" => {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("focus-matrix://open-settings", ());
                        }
                        "quit" => { let _ = window.emit("focus-matrix://quit-requested", ()); }
                        _ => {}
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Focus Matrix");
}

