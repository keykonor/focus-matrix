use sha2::{Digest, Sha256};
use std::{fs, fs::OpenOptions, io::Write, path::{Path, PathBuf}};
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
    if bytes.len()>LIMIT { return Err("单份文档不能超过 20 MB".into()); }
    let lower = name.to_ascii_lowercase(); let ext=extension(&lower)?;
    let id=format!("{:x}.{ext}",Sha256::digest(bytes)); let path=document_path(root,&id)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;
    if path.exists() {
        if fs::read(&path).map_err(|e|e.to_string())? != bytes { return Err("已有附件校验失败，文件已保留".into()); }
    } else {
        let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
        let temp=path.with_extension(format!("{ext}.{}-{stamp}.tmp",std::process::id()));
        let mut file=OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e|e.to_string())?;
        file.write_all(bytes).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?; drop(file);
        fs::rename(&temp,&path).map_err(|e|e.to_string())?;
    }
    let mut permissions=fs::metadata(&path).map_err(|e|e.to_string())?.permissions(); permissions.set_readonly(true);
    fs::set_permissions(&path,permissions).map_err(|e|e.to_string())?; Ok(id)
}
#[tauri::command]
pub fn save_task_document(app:tauri::AppHandle,name:String,bytes:Vec<u8>)->Result<String,String>{save(&app.path().app_data_dir().map_err(|e|e.to_string())?,&name,&bytes)}
#[derive(serde::Serialize)]
pub struct Document { id:String, name:String }
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
 let mut inputs=Vec::new();
 // Check every file before importing, so an unsupported selection does not
 // partially attach documents while reporting the whole paste as failed.
 for path in paths {
  let name=path.file_name().ok_or("文件名无效")?.to_string_lossy().into_owned();
  extension(&name.to_ascii_lowercase())?;
  let metadata=fs::metadata(&path).map_err(|_|"无法读取复制的文档")?;
  if !metadata.is_file() || metadata.len()>LIMIT as u64 {return Err("请选择不超过 20 MB 的文档文件".into());}
  inputs.push((path,name));
 }
 let mut result=Vec::new();
 for (path,name) in inputs {
  let bytes=fs::read(path).map_err(|_|"无法读取复制的文档")?;
  result.push(Document{id:save(&root,&name,&bytes)?,name});
 }
 Ok(result)
}
#[tauri::command]
pub fn open_task_document(app:tauri::AppHandle,id:String)->Result<(),String>{
    let path=document_path(&app.path().app_data_dir().map_err(|e|e.to_string())?,&id)?;
    if fs::metadata(&path).map_err(|_|"文档文件不存在")?.len()>LIMIT as u64 { return Err("文档文件过大".into()); }
    let bytes=fs::read(&path).map_err(|_|"文档文件不存在，请检查附件备份")?;
    if bytes.len()>LIMIT || format!("{:x}",Sha256::digest(&bytes))!=id.split('.').next().unwrap() { return Err("文档校验失败，原文件已保留".into()); }
    crate::task_links::open_target(&path.to_string_lossy())
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn preserves_documents_and_rejects_unsafe_paths(){
  let root=std::env::temp_dir().join(format!("focus-docs-{}",std::process::id()));
  let id=save(&root,"报告.PDF",b"test pdf").unwrap();
  assert_eq!(save(&root,"report.pdf",b"test pdf").unwrap(),id);
  let path=document_path(&root,&id).unwrap(); assert_eq!(fs::read(&path).unwrap(),b"test pdf");
  assert!(document_path(&root,"../file.pdf").is_err());assert!(save(&root,"run.exe",b"data").is_err());
  let mut p=fs::metadata(&path).unwrap().permissions();p.set_readonly(false);fs::set_permissions(&path,p).unwrap();fs::remove_dir_all(root).unwrap();
 }
}
