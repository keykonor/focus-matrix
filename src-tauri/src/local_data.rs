use serde_json::{json, Value};
use std::{fs::{self, OpenOptions}, io::Write, path::Path, sync::{atomic::{AtomicU64, Ordering}, Mutex}, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;

#[derive(Default)]
pub struct LocalDataState(Mutex<()>);
static SERIAL: AtomicU64 = AtomicU64::new(0);
const STORE: &str = "focus-matrix.json";
fn root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}
fn read(path: &Path) -> Result<Value, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes))
        .map_err(|_| "本地数据无法读取，已停止写入，原文件及备份仍保留".into())
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid data path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temporary = parent.join(format!(".local-save-{stamp}-{}.tmp", SERIAL.fetch_add(1, Ordering::Relaxed)));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
    file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(&temporary, path).map_err(|e| e.to_string())
}
fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    atomic_write(path, &serde_json::to_vec(value).map_err(|e| e.to_string())?)
}
fn safe_name(value: &str) -> bool {
    !value.is_empty() && value.len() < 120 && value.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
}
fn session(root: &Path) -> Result<Option<Value>, String> {
    let path = root.join(".update-session.json");
    if path.exists() { read(&path).map(Some) } else { Ok(None) }
}
fn validate(value: &Value) -> Result<(), String> {
    let object = value.as_object().ok_or("本地数据不是对象，停止写入")?;
    if object.contains_key("tasks") {
        let tasks = value["tasks"].as_array().ok_or("待办数据无法读取，停止写入")?;
        for task in tasks {
            if !task["id"].is_string() || !task["text"].is_string() || !task["completed"].is_boolean() ||
                !task["createdAt"].is_string() || !task["updatedAt"].is_string() ||
                !["important-not-urgent", "important-urgent", "not-important-not-urgent", "urgent-not-important"].contains(&task["quadrant"].as_str().unwrap_or("")) {
                return Err("存在无法读取的任务，停止写入以保护原内容".into());
            }
        }
    }
    for key in ["settings", "dailyMemos", "syncMarks"] {
        if object.contains_key(key) && !value[key].is_object() { return Err(format!("{key} 无法读取，停止写入")); }
    }
    if object.contains_key("completedTasks") && !value["completedTasks"].is_array() { return Err("已完成仓库无法读取，停止写入".into()); }
    Ok(())
}
fn commit(root: &Path, patch: Value) -> Result<(), String> {
    let path = root.join(STORE);
    let existed = path.exists();
    let mut current = if existed { read(&path)? } else { json!({}) };
    validate(&current)?;
    let before = current.clone();
    let updates = patch.as_object().ok_or("Invalid local patch")?;
    for (key, value) in updates {
        if !["tasks", "settings", "dailyMemos", "syncMarks", "completedTasks", "taskDay"].contains(&key.as_str()) {
            return Err("Unsupported local data field".into());
        }
        if key == "settings" {
            let destination = current.as_object_mut().unwrap().entry(key.clone()).or_insert(json!({}));
            let object = destination.as_object_mut().ok_or("Invalid settings")?;
            for (name, setting) in value.as_object().ok_or("Invalid settings patch")? { object.insert(name.clone(), setting.clone()); }
        } else if key == "dailyMemos" {
            let destination = current.as_object_mut().unwrap().entry(key.clone()).or_insert(json!({}));
            let object = destination.as_object_mut().ok_or("Invalid memos")?;
            for (date, memo) in value.as_object().ok_or("Invalid memo patch")? {
                if memo.is_null() { object.remove(date); continue; }
                let saved = object.entry(date.clone()).or_insert(json!({}));
                let saved = saved.as_object_mut().ok_or("Invalid memo")?;
                for (name, text) in memo.as_object().ok_or("Invalid memo update")? { saved.insert(name.clone(), text.clone()); }
            }
        } else { current[key] = value.clone(); }
    }
    validate(&current)?;
    if existed && current == before { return Ok(()); }
    // Keep the previous complete JSON, including unknown fields. A failed
    // temporary write/rename never truncates the active file.
    if existed { atomic_write(&root.join(".focus-matrix.previous.json"), &fs::read(&path).map_err(|e| e.to_string())?)?; }
    write_json(&path, &current)
}

#[tauri::command]
pub fn read_local_data(app: tauri::AppHandle, state: tauri::State<'_, LocalDataState>) -> Result<Value, String> {
    let _guard = state.0.lock().map_err(|_| "Local data lock failed")?;
    let directory = root(&app)?;
    let path = directory.join(STORE);
    if !path.exists() && directory.join("backups").exists() {
        return Err("当前数据文件缺失，发现旧备份；已停止创建空数据，请从更新备份恢复".into());
    }
    let data = if path.exists() {
        let data = read(&path)?; validate(&data)?;
        if !data["tasks"].is_array() { return Err("原数据缺少任务列表，已停止加载空数据，请从更新备份恢复".into()); }
        data
    } else { Value::Null };
    let update = session(&directory)?;
    let receipt = directory.join(".update-restored.json");
    let receipt = if receipt.exists() { Some(read(&receipt)?) } else { None };
    let restoring = update.as_ref().filter(|u| u["phase"] == "restoring" ||
        (u["phase"] == "verified" && !receipt.as_ref().is_some_and(|r| r["nonce"] == u["nonce"] && r["verified"] == true)));
    if let Some(update) = restoring {
        let name = update["backupName"].as_str().filter(|s| safe_name(s)).ok_or("Invalid update backup")?;
        let expected = fs::read(directory.join("backups").join(name).join(STORE)).map_err(|e| e.to_string())?;
        if fs::read(&path).map_err(|e| e.to_string())? != expected { return Err("更新快照核对失败，停止启动以保护更新前内容".into()); }
    }
    Ok(json!({"data": data, "guardDate": update.as_ref().and_then(|u| u["guardDate"].as_str()),
        "updateNonce": restoring.and_then(|u| u["nonce"].as_str())}))
}
#[tauri::command]
pub fn commit_local_data(app: tauri::AppHandle, state: tauri::State<'_, LocalDataState>, patch: Value) -> Result<(), String> {
    let _guard = state.0.lock().map_err(|_| "Local data lock failed")?;
    commit(&root(&app)?, patch)
}
#[tauri::command]
pub fn read_update_request(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let directory = root(&app)?;
    let request = directory.join(".update-request.json");
    if !request.exists() { return Ok(None); }
    let request = read(&request)?;
    if request["cancelled"] == true { return Ok(None); }
    let nonce = request["nonce"].as_str().filter(|s| safe_name(s)).ok_or("Invalid update request")?;
    let ready = directory.join(".update-ready.json");
    if ready.exists() && read(&ready)?["nonce"] == nonce { return Ok(None); }
    Ok(Some(nonce.to_owned()))
}
#[tauri::command]
pub fn finish_update_prepare(app: tauri::AppHandle, nonce: String) -> Result<(), String> {
    if read_update_request(app.clone())?.as_deref() != Some(&nonce) { return Err("Update request changed".into()) }
    let directory = root(&app)?;
    validate(&read(&directory.join(STORE))?)?;
    write_json(&directory.join(".update-ready.json"), &json!({"nonce": nonce, "pid": std::process::id(), "protocol": 2}))
}
#[tauri::command]
pub fn ack_update_restore(app: tauri::AppHandle, nonce: String, state: tauri::State<'_, LocalDataState>) -> Result<(), String> {
    let _guard = state.0.lock().map_err(|_| "Local data lock failed")?;
    let directory = root(&app)?;
    let mut update = session(&directory)?.ok_or("No update snapshot")?;
    if update["nonce"] != nonce { return Err("Update snapshot changed".into()) }
    let receipt = directory.join(".update-restored.json");
    if update["phase"] == "verified" && receipt.exists() && read(&receipt)?["nonce"] == nonce { return Ok(()); }
    if update["phase"] != "restoring" && update["phase"] != "verified" { return Err("Update snapshot changed".into()) }
    let name = update["backupName"].as_str().filter(|s| safe_name(s)).ok_or("Invalid update backup")?;
    let expected = fs::read(directory.join("backups").join(name).join(STORE)).map_err(|e| e.to_string())?;
    if fs::read(directory.join(STORE)).map_err(|e| e.to_string())? != expected { return Err("更新后内容不匹配，停止确认更新".into()) }
    update["phase"] = json!("verified");
    write_json(&receipt, &json!({"nonce": nonce, "pid": std::process::id(), "verified": true}))?;
    write_json(&directory.join(".update-session.json"), &update)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> std::path::PathBuf {
        let directory = std::env::temp_dir().join(format!("focus-atomic-{}-{}", std::process::id(), SERIAL.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(&directory).unwrap(); directory
    }
    #[test]
    fn task_archive_patch_preserves_all_other_state_and_previous_bytes() {
        let root = fixture();
        let original = br#"{"tasks":[],"dailyMemos":{"2026-10-16":{"morning":"keep","future":"keep"}},"settings":{"opacity":90,"unknown":true},"futureData":{"keep":true},"syncMarks":{"keep":1}}"#;
        fs::write(root.join(STORE), original).unwrap();
        commit(&root, json!({"completedTasks": [], "taskDay":"2026-10-17", "tasks":[]})).unwrap();
        let now = read(&root.join(STORE)).unwrap();
        assert_eq!(now["dailyMemos"]["2026-10-16"]["future"], "keep");
        assert_eq!(now["settings"]["unknown"], true);
        assert_eq!(now["futureData"]["keep"], true);
        assert_eq!(now["syncMarks"]["keep"], 1);
        assert_eq!(fs::read(root.join(".focus-matrix.previous.json")).unwrap(), original);
        commit(&root, json!({"dailyMemos":{"2026-10-16":{"morning":"changed"}},"settings":{"opacity":85}})).unwrap();
        let now = read(&root.join(STORE)).unwrap();
        assert_eq!(now["dailyMemos"]["2026-10-16"]["future"], "keep");
        assert_eq!(now["settings"]["unknown"], true);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn unreadable_data_or_failed_backup_never_truncates_current_file() {
        let root = fixture();
        fs::write(root.join(STORE), b"broken original").unwrap();
        assert!(commit(&root, json!({"tasks":[]})).is_err());
        assert_eq!(fs::read(root.join(STORE)).unwrap(), b"broken original");
        let original = br#"{"tasks":[],"settings":{"keep":true}}"#;
        fs::write(root.join(STORE), original).unwrap();
        fs::create_dir(root.join(".focus-matrix.previous.json")).unwrap();
        assert!(commit(&root, json!({"taskDay":"2026-10-17"})).is_err());
        assert_eq!(fs::read(root.join(STORE)).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }
}
