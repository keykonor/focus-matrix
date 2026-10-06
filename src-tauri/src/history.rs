use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf},
    sync::{atomic::{AtomicU64, Ordering}, Mutex}, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;

static SERIAL: AtomicU64 = AtomicU64::new(0);
#[derive(Default)]
pub struct HistoryState(Mutex<Option<String>>);

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedTask {
    id: String, text: String, completed: bool, created_at: String, updated_at: String, quadrant: String,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SavedMemo {
    #[serde(default)] morning: String,
    #[serde(default)] afternoon: String,
    #[serde(default)] evening: String,
    #[serde(default)] updated_at: String,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Content {
    tasks: Vec<SavedTask>,
    #[serde(default)] daily_memos: BTreeMap<String, SavedMemo>,
}
impl Content {
    fn validate(&self) -> Result<(), String> {
        for task in &self.tasks {
            if !["important-not-urgent", "important-urgent", "not-important-not-urgent", "urgent-not-important"].contains(&task.quadrant.as_str()) {
                return Err("Invalid task quadrant in history".into());
            }
        }
        for date in self.daily_memos.keys() {
            if !valid_date(date) { return Err("Invalid memo date in history".into()); }
        }
        Ok(())
    }
}
fn valid_date(date: &str) -> bool {
    if date.len() != 10 || date.as_bytes()[4] != b'-' || date.as_bytes()[7] != b'-' { return false; }
    let parts: Vec<_> = date.split('-').collect();
    let numbers: Option<Vec<u32>> = parts.iter().map(|p| p.parse::<u32>().ok()).collect();
    let Some(values) = numbers else { return false; };
    if values.len() != 3 { return false; }
    let (year, month, day) = (values[0], values[1], values[2]);
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month { 2 => if leap { 29 } else { 28 }, 4 | 6 | 9 | 11 => 30, 1 | 3 | 5 | 7 | 8 | 10 | 12 => 31, _ => 0 };
    year >= 100 && day > 0 && day <= max_day
}

#[derive(Clone, Copy, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Reason { Automatic, Manual, BeforeRestore, Initial, UpdateBackup }
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    schema_version: u32, id: String, created_at: u64, reason: Reason, content: Content,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary { id: String, created_at: u64, reason: Reason, task_count: usize, memo_count: usize }
impl Version {
    fn summary(&self) -> Summary {
        Summary { id: self.id.clone(), created_at: self.created_at, reason: self.reason,
            task_count: self.content.tasks.len(), memo_count: self.content.daily_memos.values()
                .filter(|m| !m.morning.trim().is_empty() || !m.afternoon.trim().is_empty() || !m.evening.trim().is_empty()).count() }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionList { versions: Vec<Summary>, unreadable_count: usize }

fn clock_millis(time: SystemTime) -> u64 { time.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn history_dir(root: &Path) -> PathBuf { root.join("history") }
fn read_content(path: &Path) -> Result<Content, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    let content: Content = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    content.validate()?;
    Ok(content)
}
fn record(root: &Path, last: &mut Option<String>, content: Content, reason: Reason, force: bool) -> Result<Option<Summary>, String> {
    content.validate()?;
    let fingerprint = serde_json::to_string(&content).map_err(|e| e.to_string())?;
    if !force && last.as_ref() == Some(&fingerprint) { return Ok(None); }
    let directory = history_dir(root);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let id = format!("version-{nanos}-{}.json", SERIAL.fetch_add(1, Ordering::Relaxed));
    let version = Version { schema_version: 1, id: id.clone(), created_at: clock_millis(SystemTime::now()), reason, content };
    let bytes = serde_json::to_vec(&version).map_err(|e| e.to_string())?;
    // Never overwrite a version. Flush it to disk before the current data can change.
    let mut file = OpenOptions::new().create_new(true).write(true).open(directory.join(id)).map_err(|e| e.to_string())?;
    file.write_all(&bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
    *last = Some(fingerprint);
    Ok(Some(version.summary()))
}
fn save(root: &Path, last: &mut Option<String>, content: Content, reason: Reason) -> Result<Option<Summary>, String> {
    let current = root.join("focus-matrix.json");
    if current.exists() {
        let previous = read_content(&current)?;
        let initial = last.is_none();
        record(root, last, previous, if initial { Reason::Initial } else { Reason::Automatic }, false)?;
    }
    record(root, last, content, reason, reason != Reason::Automatic)
}

fn safe_name(name: &str) -> bool {
    !name.is_empty() && name.len() < 150 && name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.') && !name.contains("..")
}
fn get(root: &Path, id: &str) -> Result<Version, String> {
    let backup_path = if let Some(folder) = id.strip_prefix("backup:") {
        if !safe_name(folder) { return Err("Invalid backup id".into()); }
        Some(root.join("backups").join(folder).join("focus-matrix.json"))
    } else if id == "legacy:before-widget" { Some(root.join("focus-matrix.json.before-widget"))
    } else if id == "legacy:before-multiline" { Some(root.join("focus-matrix.json.before-multiline"))
    } else { None };
    if let Some(path) = backup_path {
        let content = read_content(&path)?;
        let modified = fs::metadata(&path).and_then(|meta| meta.modified()).map_err(|e| e.to_string())?;
        return Ok(Version { schema_version: 1, id: id.into(), created_at: clock_millis(modified), reason: Reason::UpdateBackup, content });
    }
    if !safe_name(id) || !id.starts_with("version-") || !id.ends_with(".json") { return Err("Invalid history id".into()); }
    let bytes = fs::read(history_dir(root).join(id)).map_err(|e| e.to_string())?;
    let version: Version = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if version.schema_version != 1 || version.id != id { return Err("Invalid history file".into()); }
    version.content.validate()?;
    Ok(version)
}
fn list(root: &Path) -> Result<VersionList, String> {
    let mut ids = Vec::new();
    let directory = history_dir(root);
    if directory.exists() {
        for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("version-") && name.ends_with(".json") { ids.push(name); }
        }
    }
    let backups = root.join("backups");
    if backups.exists() {
        for entry in fs::read_dir(backups).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.path().join("focus-matrix.json").is_file() { ids.push(format!("backup:{}", entry.file_name().to_string_lossy())); }
        }
    }
    for suffix in ["before-widget", "before-multiline"] {
        if root.join(format!("focus-matrix.json.{suffix}")).is_file() { ids.push(format!("legacy:{suffix}")); }
    }
    let mut versions = Vec::new();
    let mut unreadable_count = 0;
    for id in ids {
        match get(root, &id) { Ok(version) => versions.push(version.summary()), Err(_) => unreadable_count += 1 }
    }
    versions.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.id.cmp(&a.id)));
    Ok(VersionList { versions, unreadable_count })
}

#[tauri::command]
pub async fn save_content_version(app: tauri::AppHandle, state: tauri::State<'_, HistoryState>, content: Content, reason: Reason) -> Result<Option<Summary>, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut last = state.0.lock().map_err(|e| e.to_string())?;
    save(&root, &mut last, content, reason)
}
#[tauri::command]
pub async fn list_content_versions(app: tauri::AppHandle) -> Result<VersionList, String> {
    list(&app.path().app_data_dir().map_err(|e| e.to_string())?)
}
#[tauri::command]
pub async fn get_content_version(app: tauri::AppHandle, id: String) -> Result<Version, String> {
    get(&app.path().app_data_dir().map_err(|e| e.to_string())?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("focus-matrix-history-test-{}-{}", std::process::id(), SERIAL.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(&root).unwrap(); root
    }
    fn content(text: &str) -> Content {
        Content { tasks: vec![SavedTask { id: "one".into(), text: text.into(), completed: false, created_at: "original".into(), updated_at: "original".into(), quadrant: "important-urgent".into() }], daily_memos: BTreeMap::from([("2026-10-03".into(), SavedMemo { evening: "晚间记录".into(), ..Default::default() })]) }
    }
    #[test]
    fn previous_current_manual_and_restore_versions_are_durable() {
        let root = temp_root(); let original = content("原有内容"); let edited = content("新内容");
        fs::write(root.join("focus-matrix.json"), serde_json::to_vec(&original).unwrap()).unwrap();
        let mut last = None;
        let latest = save(&root, &mut last, edited.clone(), Reason::Automatic).unwrap().unwrap();
        assert_eq!(list(&root).unwrap().versions.len(), 2);
        assert_eq!(get(&root, &latest.id).unwrap().content, edited);
        fs::write(root.join("focus-matrix.json"), serde_json::to_vec(&edited).unwrap()).unwrap();
        assert!(save(&root, &mut last, edited.clone(), Reason::Automatic).unwrap().is_none());
        save(&root, &mut last, edited.clone(), Reason::Manual).unwrap();
        let before_restore = save(&root, &mut last, edited.clone(), Reason::BeforeRestore).unwrap().unwrap();
        save(&root, &mut last, original.clone(), Reason::Automatic).unwrap();
        assert_eq!(get(&root, &before_restore.id).unwrap().content, edited);
        assert_eq!(list(&root).unwrap().versions.len(), 5);
        let reopened = list(&root).unwrap(); assert_eq!(reopened.versions.len(), 5);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn old_backups_load_bad_files_are_isolated_and_paths_are_restricted() {
        let root = temp_root(); let folder = root.join("backups").join("20261003-test"); fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("focus-matrix.json"), serde_json::to_vec(&content("旧备份")).unwrap()).unwrap();
        assert_eq!(get(&root, "backup:20261003-test").unwrap().content.tasks[0].text, "旧备份");
        fs::create_dir_all(history_dir(&root)).unwrap();
        fs::write(history_dir(&root).join("version-damaged.json"), b"{bad").unwrap();
        let result = list(&root).unwrap(); assert_eq!(result.versions.len(), 1); assert_eq!(result.unreadable_count, 1);
        assert!(get(&root, "backup:../other").is_err()); assert!(get(&root, "../../focus-matrix.json").is_err());
        fs::write(root.join("focus-matrix.json"), b"{bad").unwrap();
        assert!(save(&root, &mut None, content("不要覆盖"), Reason::Automatic).is_err());
        assert_eq!(fs::read(root.join("focus-matrix.json")).unwrap(), b"{bad");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn an_unwritable_history_directory_does_not_touch_the_current_file() {
        let root = temp_root();
        let original = serde_json::to_vec(&content("原始内容保持不变")).unwrap();
        fs::write(root.join("focus-matrix.json"), &original).unwrap();
        fs::write(history_dir(&root), b"blocking-file").unwrap();
        assert!(save(&root, &mut None, content("新内容"), Reason::Automatic).is_err());
        assert_eq!(fs::read(root.join("focus-matrix.json")).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }
}
