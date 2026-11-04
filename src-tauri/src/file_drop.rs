// Window registration approach adapted from Wry's webview2/drag_drop.rs.
// Copyright 2020-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: MIT
// Upstream MIT notice: licenses/wry-MIT.txt
// Unlike Wry's file-only handler, this receiver also accepts Unicode text/URLs.
use std::{cell::Cell, ffi::OsString, os::windows::ffi::OsStringExt, path::PathBuf};
use tauri::{Emitter, Manager};
use windows::{core::implement, Win32::{
    Foundation::{HWND, LPARAM, POINT, POINTL}, Graphics::Gdi::ScreenToClient,
    System::{Com::{IDataObject, FORMATETC, DVASPECT_CONTENT, TYMED_HGLOBAL, STGMEDIUM},
        Memory::{GlobalLock, GlobalUnlock, GlobalSize},
        Ole::{IDropTarget, IDropTarget_Impl, RegisterDragDrop, RevokeDragDrop, ReleaseStgMedium,
            DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE}, SystemServices::MODIFIERKEYS_FLAGS},
    UI::{Shell::{HDROP, DragQueryFileW}, WindowsAndMessaging::EnumChildWindows},
}};

enum Payload { Files(Vec<PathBuf>), Text(String) }
struct Medium(STGMEDIUM);
impl Drop for Medium { fn drop(&mut self) { unsafe { ReleaseStgMedium(&mut self.0); } } }
unsafe fn medium(data: &IDataObject, format: u16) -> Option<Medium> {
    data.GetData(&FORMATETC { cfFormat:format, ptd:std::ptr::null_mut(), dwAspect:DVASPECT_CONTENT.0,
        lindex:-1, tymed:TYMED_HGLOBAL.0 as u32 }).ok().map(Medium)
}
unsafe fn payload(data: &IDataObject) -> Option<Payload> {
    if let Some(value)=medium(data,15) {
        let drop=HDROP(value.0.u.hGlobal.0);
        let count=DragQueryFileW(drop,u32::MAX,None);
        if count==0 || count>64 {return None;}
        let mut paths=Vec::new();
        for index in 0..count {
            let length=DragQueryFileW(drop,index,None) as usize;
            if length==0 || length>32767 {return None;}
            let mut name=vec![0u16;length+1];
            DragQueryFileW(drop,index,Some(&mut name));
            paths.push(PathBuf::from(OsString::from_wide(&name[..length])));
        }
        return Some(Payload::Files(paths));
    }
    let value=medium(data,13)?; // CF_UNICODETEXT, also supplied by browser URL drags.
    let handle=value.0.u.hGlobal;
    let length=GlobalSize(handle)/2;
    if length==0 || length>512*1024 {return None;}
    let pointer=GlobalLock(handle) as *const u16;
    if pointer.is_null() {return None;}
    let raw=std::slice::from_raw_parts(pointer,length);
    let end=raw.iter().position(|c|*c==0).unwrap_or(length);
    let text=String::from_utf16_lossy(&raw[..end]);
    let _=GlobalUnlock(handle);
    if text.trim().is_empty(){None}else{Some(Payload::Text(text))}
}

#[implement(IDropTarget)]
struct Receiver { window:tauri::WebviewWindow, valid:Cell<bool> }
impl Receiver {
    fn effect(&self, output:*mut DROPEFFECT) { if !output.is_null() {unsafe {*output=if self.valid.get(){DROPEFFECT_COPY}else{DROPEFFECT_NONE};}} }
}
#[allow(non_snake_case)]
impl IDropTarget_Impl for Receiver_Impl {
    fn DragEnter(&self,data:windows_core::Ref<'_,IDataObject>,_:MODIFIERKEYS_FLAGS,_:&POINTL,effect:*mut DROPEFFECT)->windows::core::Result<()> {
        self.valid.set(data.as_ref().and_then(|d|unsafe{payload(d)}).is_some());self.effect(effect);Ok(())
    }
    fn DragOver(&self,_:MODIFIERKEYS_FLAGS,_:&POINTL,effect:*mut DROPEFFECT)->windows::core::Result<()> {self.effect(effect);Ok(())}
    fn DragLeave(&self)->windows::core::Result<()> {self.valid.set(false);Ok(())}
    fn Drop(&self,data:windows_core::Ref<'_,IDataObject>,_:MODIFIERKEYS_FLAGS,point:&POINTL,effect:*mut DROPEFFECT)->windows::core::Result<()> {
        self.valid.set(false);
        if let Some(value)=data.as_ref().and_then(|d|unsafe{payload(d)}) {
            if let Ok(hwnd)=self.window.hwnd() {
                let mut pos=POINT{x:point.x,y:point.y};let _=unsafe{ScreenToClient(hwnd,&mut pos)};
                let scale=self.window.scale_factor().unwrap_or(1.0);
                let mut event=serde_json::json!({"x":pos.x as f64/scale,"y":pos.y as f64/scale});
                match value {
                    Payload::Files(paths)=>{
                        event["name"]=paths.first().and_then(|p|p.file_name()).map(|s|s.to_string_lossy().into_owned()).unwrap_or("文件".into()).into();
                        if let Some(id)=self.window.state::<crate::task_documents::DropState>().grant(paths) {event["id"]=id.into();}else{return Ok(());}
                    },
                    Payload::Text(text)=>event["text"]=text.into(),
                }
                self.valid.set(self.window.emit("focus-matrix://files-dropped",event).is_ok());
            }
        }
        self.effect(effect);self.valid.set(false);Ok(())
    }
}

// Called on WebView's STA thread after its child windows have been created.
// RegisterDragDrop owns a COM reference until WebView destroys each HWND.
pub fn install(window:&tauri::WebviewWindow) -> tauri::Result<()> {
    let receiver_window=window.clone();
    window.with_webview(move |_| {
        let Ok(hwnd)=receiver_window.hwnd() else {return;};
        let mut callback=|child:HWND| {
            // Only replace existing OLE targets (the WebView), not arbitrary controls.
            if unsafe{RevokeDragDrop(child)}.is_ok() {
                let receiver:IDropTarget=Receiver{window:receiver_window.clone(),valid:Cell::new(false)}.into();
                if let Err(error)=unsafe{RegisterDragDrop(child,&receiver)} {eprintln!("文件拖放初始化失败: {error}");}
            }
        };
        let mut callback_ref:&mut dyn FnMut(HWND)=&mut callback;
        unsafe extern "system" fn visit(hwnd:HWND,param:LPARAM)->windows::core::BOOL {
            let callback=&mut *(param.0 as *mut &mut dyn FnMut(HWND));callback(hwnd);true.into()
        }
        let _=unsafe{EnumChildWindows(Some(hwnd),Some(visit),LPARAM(&mut callback_ref as *mut _ as isize))};
    })
}
