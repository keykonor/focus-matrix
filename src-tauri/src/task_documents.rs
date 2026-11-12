use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}, sync::{Mutex,atomic::{AtomicU64,Ordering}},collections::HashMap};
use tauri::Manager;
const LIMIT: usize = 20 * 1024 * 1024;
fn extension(name: &str) -> Result<&str,String> {
    let ext = name.rsplit('.').next().ok_or("文档缺少扩展名")?;
    if !["pdf","doc","docx","xls","xlsx","ppt","pptx","txt","md","csv","rtf","odt","ods","odp"].contains(&ext) { return Err("不支持此文档类型".into()); }
    Ok(ext)
}
fn document_path(root: &Path, id: &str) -> Result<PathBuf,String> {
    let (hash, ext) = id.split_once('.').ok_or("文档标识无效")?;
    if hash.len()!=64 || !hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) { return Err("文档标识无效".into()); }
    if ext != extension(id)? { return Err("文档标识无效".into()); }
    Ok(root.join("documents").join(id))
}
fn save(root:&Path, name:&str, bytes:&[u8]) -> Result<String,String> {
    save_with_writer(root,name,bytes,crate::local_data::atomic_write)
}
fn save_with_writer(root:&Path,name:&str,bytes:&[u8],write:impl FnOnce(&Path,&[u8])->Result<(),String>)->Result<String,String>{
    if bytes.len()>LIMIT { return Err("单份文档不能超过 20 MB".into()); }
    let lower = name.to_ascii_lowercase(); let ext=extension(&lower)?;
    let id=format!("{:x}.{ext}",Sha256::digest(bytes)); let path=document_path(root,&id)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;
    crate::local_data::recover_write(&path)?;
    if path.exists() {
        if fs::read(&path).map_err(|e|e.to_string())? != bytes { return Err("已有附件校验失败，文件已保留".into()); }
    } else {
        write(&path,bytes)?;
    }
    let mut permissions=fs::metadata(&path).map_err(|e|e.to_string())?.permissions(); permissions.set_readonly(true);
    fs::set_permissions(&path,permissions).map_err(|e|e.to_string())?; Ok(id)
}
#[tauri::command]
pub fn save_task_document(app:tauri::AppHandle,name:String,bytes:Vec<u8>)->Result<String,String>{save(&app.path().app_data_dir().map_err(|e|e.to_string())?,&name,&bytes)}
#[derive(serde::Serialize)]
pub struct Document { id:String, name:String, kind:&'static str }
#[derive(Default)]
pub struct DropState(Mutex<HashMap<String,Vec<PathBuf>>>);
static DROP_SERIAL:AtomicU64=AtomicU64::new(0);
impl DropState {
 pub fn grant(&self,paths:Vec<PathBuf>)->Option<String>{
  let mut pending=self.0.lock().ok()?;
  if pending.len()>=32 {pending.clear();}
  let id=DROP_SERIAL.fetch_add(1,Ordering::Relaxed).to_string();pending.insert(id.clone(),paths);Some(id)
 }
 fn take(&self,id:&str)->Result<Vec<PathBuf>,String>{self.0.lock().map_err(|_|"拖放状态不可用")?.remove(id).ok_or("拖入的文件已处理，请重新拖入".into())}
}
#[tauri::command]
pub fn take_dropped_files(app:tauri::AppHandle,state:tauri::State<'_,DropState>,id:String)->Result<Vec<Document>,String>{
 import_files(&app.path().app_data_dir().map_err(|e|e.to_string())?,state.take(&id)?)
}

#[tauri::command]
pub fn take_chat_screenshot(state: tauri::State<'_, DropState>, id: String) -> Result<tauri::ipc::Response, String> {
    use std::io::Read;
    const IMAGE_LIMIT: u64 = 10 * 1024 * 1024;
    let paths = state.take(&id)?;
    let [path] = paths.as_slice() else { return Err("每次请拖入一张截图".into()); };
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "webp"].contains(&extension.as_str()) {
        return Err("请选择 PNG、JPEG 或 WebP 截图".into());
    }
    let file = fs::File::open(path).map_err(|_| "无法读取截图")?;
    let metadata = file.metadata().map_err(|_| "无法读取截图")?;
    if !metadata.is_file() || metadata.len() > IMAGE_LIMIT { return Err("请选择不超过 10 MB 的截图".into()); }
    let mut bytes = Vec::new();
    file.take(IMAGE_LIMIT + 1).read_to_end(&mut bytes).map_err(|_| "无法读取截图")?;
    if bytes.is_empty() || bytes.len() as u64 > IMAGE_LIMIT { return Err("截图为空或超过 10 MB".into()); }
    Ok(tauri::ipc::Response::new(bytes))
}
#[cfg(windows)]
#[link(name="user32")]
unsafe extern "system" {
 fn OpenClipboard(owner:isize)->i32;
 fn CloseClipboard()->i32;
 fn GetClipboardData(format:u32)->isize;
}
#[cfg(windows)]
#[link(name="shell32")]
unsafe extern "system" { fn DragQueryFileW(drop:isize,index:u32,file:*mut u16,size:u32)->u32; }
#[cfg(windows)]
fn clipboard_paths()->Result<Vec<PathBuf>,String>{
 unsafe {
  if OpenClipboard(0)==0 {return Err("剪贴板正忙，请重试粘贴".into());}
  let drop=GetClipboardData(15);
  let mut paths=Vec::new();
  if drop!=0 {
   let count=DragQueryFileW(drop,u32::MAX,std::ptr::null_mut(),0);
   if count>64 {CloseClipboard();return Err("请每次粘贴不超过 64 份文档".into());}
   for index in 0..count {
    let length=DragQueryFileW(drop,index,std::ptr::null_mut(),0);
    let mut name=vec![0u16;length as usize+1];
    let copied=DragQueryFileW(drop,index,name.as_mut_ptr(),length+1);
    paths.push(PathBuf::from(String::from_utf16_lossy(&name[..copied as usize])));
   }
  }
  CloseClipboard();Ok(paths)
 }
}
#[tauri::command]
pub fn paste_task_documents(app:tauri::AppHandle)->Result<Vec<Document>,String>{
 let root=app.path().app_data_dir().map_err(|e|e.to_string())?;
 #[cfg(windows)] let paths=clipboard_paths()?;
 #[cfg(not(windows))] let paths:Vec<PathBuf>=Vec::new();
 import_files(&root,paths)
}
fn import_files(root:&Path,paths:Vec<PathBuf>)->Result<Vec<Document>,String>{
 if paths.len()>64 {return Err("每次最多添加 64 个文件".into());}
 let mut inputs=Vec::new();
 // Check every file before importing, so an unsupported selection does not
 // partially attach documents while reporting the whole paste as failed.
 for path in paths {
  let name=path.file_name().ok_or("文件名无效")?.to_string_lossy().into_owned();
  let lower=name.to_ascii_lowercase();
  let image=["png","jpg","jpeg","gif","webp"].contains(&lower.rsplit('.').next().unwrap_or(""));
  if !image {extension(&lower)?;}
  let metadata=fs::metadata(&path).map_err(|_|"无法读取复制的文档")?;
  if !metadata.is_file() || metadata.len()>LIMIT as u64 {return Err("请选择不超过 20 MB 的文档文件".into());}
  inputs.push((path,name,image));
 }
 let mut result=Vec::new();
 for (path,name,image) in inputs {
  let bytes=fs::read(path).map_err(|_|"无法读取复制的文档")?;
  let id=if image {crate::task_images::save_image(root,&bytes)?} else {save(root,&name,&bytes)?};
  result.push(Document{id,name,kind:if image {"image"}else{"document"}});
 }
 Ok(result)
}
#[tauri::command]
pub fn open_task_document(app:tauri::AppHandle,id:String)->Result<(),String>{
    let path=document_path(&app.path().app_data_dir().map_err(|e|e.to_string())?,&id)?;
    crate::local_data::recover_write(&path)?;
    if fs::metadata(&path).map_err(|_|"文档文件不存在")?.len()>LIMIT as u64 { return Err("文档文件过大".into()); }
    let bytes=fs::read(&path).map_err(|_|"文档文件不存在，请检查附件备份")?;
    if bytes.len()>LIMIT || format!("{:x}",Sha256::digest(&bytes))!=id.split('.').next().unwrap() { return Err("文档校验失败，原文件已保留".into()); }
    crate::task_links::open_target(&path.to_string_lossy())
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn dropped_files_are_authorized_once_and_imported_as_copies(){
  let root=std::env::temp_dir().join(format!("focus-transfer-{}",std::process::id()));
  fs::create_dir_all(&root).unwrap();
  let source=root.join("source");let target=root.join("app");fs::create_dir_all(&source).unwrap();
  let doc=source.join("中文 报告.TXT");let image=source.join("图片.png");
  fs::write(&doc,b"document data").unwrap();fs::write(&image,b"\x89PNG\r\n\x1a\nsynthetic").unwrap();
  let state=DropState::default();let token=state.grant(vec![doc.clone(),image]).unwrap();
  assert!(state.take("untrusted").is_err());
  let imported=import_files(&target,state.take(&token).unwrap()).unwrap();
  assert!(state.take(&token).is_err());assert_eq!(imported.len(),2);
  assert_eq!(imported[0].kind,"document");assert_eq!(imported[1].kind,"image");
  assert_eq!(fs::read(&doc).unwrap(),b"document data");
  let stored=document_path(&target,&imported[0].id).unwrap();assert!(fs::metadata(&stored).unwrap().permissions().readonly());
  fs::remove_file(doc).unwrap();assert_eq!(fs::read(&stored).unwrap(),b"document data");
  let invalid=source.join("run.exe");fs::write(&invalid,b"unsafe").unwrap();
  assert!(import_files(&target,vec![invalid]).is_err());
  let mut permissions=fs::metadata(&stored).unwrap().permissions();permissions.set_readonly(false);fs::set_permissions(stored,permissions).unwrap();
  fs::remove_dir_all(root).unwrap();
 }
 #[cfg(windows)]
 #[test] fn documents_survive_windows_rename_error_17(){
  let root=std::env::temp_dir().join(format!("focus-docs-efs-{}",std::process::id()));
  fs::create_dir_all(&root).unwrap();
  let id=save_with_writer(&root,"加密目录报告.pdf",b"synthetic document",|path,bytes|
    crate::local_data::atomic_write_with_rename(path,bytes,|_,_|Err(std::io::Error::from_raw_os_error(17)))).expect("error 17 fallback");
  let path=document_path(&root,&id).unwrap();assert_eq!(fs::read(&path).unwrap(),b"synthetic document");
  assert_eq!(save(&root,"加密目录报告.pdf",b"synthetic document").unwrap(),id);
  let mut p=fs::metadata(&path).unwrap().permissions();p.set_readonly(false);fs::set_permissions(path,p).unwrap();fs::remove_dir_all(root).unwrap();
 }
 #[test] fn preserves_documents_and_rejects_unsafe_paths(){
  let root=std::env::temp_dir().join(format!("focus-docs-{}",std::process::id()));
  let id=save(&root,"报告.PDF",b"test pdf").unwrap();
  assert_eq!(save(&root,"report.pdf",b"test pdf").unwrap(),id);
  let path=document_path(&root,&id).unwrap(); assert_eq!(fs::read(&path).unwrap(),b"test pdf");
  assert!(document_path(&root,"../file.pdf").is_err());assert!(save(&root,"run.exe",b"data").is_err());
  let mut p=fs::metadata(&path).unwrap().permissions();p.set_readonly(false);fs::set_permissions(&path,p).unwrap();fs::remove_dir_all(root).unwrap();
 }
}
