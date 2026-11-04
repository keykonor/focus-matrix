#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn images_are_content_addressed_and_can_be_read_after_restart() {
        let root = std::env::temp_dir().join(format!("focus-matrix-image-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let bytes = b"\x89PNG\r\n\x1a\nexample";
        let id = save_image(&root, bytes).unwrap();
        assert_eq!(save_image(&root, bytes).unwrap(), id);
        assert_eq!(read_image(&root, &id).unwrap(), bytes);
        assert!(read_image(&root, "../secret").is_err());
        assert!(save_image(&root, b"not an image").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
use sha2::{Digest, Sha256};
use std::{fs, fs::OpenOptions, io::Write, path::Path};
use tauri::Manager;
const LIMIT: usize = 10 * 1024 * 1024;

fn image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { Some("png") }
    else if bytes.starts_with(&[0xff, 0xd8, 0xff]) { Some("jpg") }
    else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") { Some("gif") }
    else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" { Some("webp") }
    else { None }
}
fn valid_id(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub(crate) fn save_image(root: &Path, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > LIMIT || image_type(bytes).is_none() { return Err("图片格式不支持或超过 10 MB".into()); }
    let id = format!("{:x}", Sha256::digest(bytes));
    let dir = root.join("images");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&id);
    match OpenOptions::new().write(true).create_new(true).open(&path) {
        Ok(mut file) => { file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?; }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            if read_image(root, &id)? != bytes { return Err("已有图片校验失败，原文件已保留".into()); }
        }
        Err(e) => return Err(e.to_string()),
    }
    Ok(id)
}
fn read_image(root: &Path, id: &str) -> Result<Vec<u8>, String> {
    if !valid_id(id) { return Err("图片标识无效".into()); }
    let path = root.join("images").join(id);
    let metadata = fs::metadata(&path).map_err(|_| "图片文件不存在")?;
    if metadata.len() > LIMIT as u64 { return Err("图片文件过大".into()); }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if image_type(&bytes).is_none() || format!("{:x}", Sha256::digest(&bytes)) != id { return Err("图片校验失败".into()); }
    Ok(bytes)
}

#[tauri::command]
pub fn save_task_image(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<String, String> {
    save_image(&app.path().app_data_dir().map_err(|e| e.to_string())?, &bytes)
}
#[tauri::command]
pub fn read_task_image(app: tauri::AppHandle, id: String) -> Result<Vec<u8>, String> {
    read_image(&app.path().app_data_dir().map_err(|e| e.to_string())?, &id)
}
