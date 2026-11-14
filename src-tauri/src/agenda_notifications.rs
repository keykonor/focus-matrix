use std::{ffi::OsString, mem::ManuallyDrop, os::windows::ffi::{OsStrExt, OsStringExt}, path::{Path, PathBuf}};
use windows::{
    core::{w, Error, GUID, HSTRING, Interface, PCWSTR, PWSTR},
    UI::Notifications::{NotificationSetting, ToastNotification, ToastNotificationManager, ToastTemplateType},
    Win32::{
        Foundation::{E_FAIL, PROPERTYKEY},
        System::{
            Com::{CoCreateInstance, CoTaskMemFree, IPersistFile, CLSCTX_INPROC_SERVER,
                StructuredStorage::{PropVariantClear, PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0}},
            Variant::VT_LPWSTR,
            WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
        },
        UI::Shell::{IShellLinkW, PropertiesSystem::IPropertyStore, ShellLink,
            FOLDERID_Programs, KF_FLAG_CREATE, SHGetKnownFolderPath, SHChangeNotify, SHCNE_CREATE,
            SHCNF_FLUSH, SHCNF_PATHW, SHStrDupW},
    },
};

const APPLICATION_ID: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3), pid: 5,
};

struct Apartment;
impl Apartment {
    fn enter() -> windows::core::Result<Self> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED)?; }
        Ok(Self)
    }
}
impl Drop for Apartment {
    fn drop(&mut self) { unsafe { RoUninitialize(); } }
}

fn wide(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain([0]).collect()
}

fn start_menu() -> windows::core::Result<PathBuf> {
    unsafe {
        let path = SHGetKnownFolderPath(&FOLDERID_Programs, KF_FLAG_CREATE, None)?;
        let result = PathBuf::from(OsString::from_wide(path.as_wide()));
        CoTaskMemFree(Some(path.0.cast()));
        Ok(result)
    }
}

fn create_shortcut(path: &Path, executable: &Path, id: &str) -> windows::core::Result<()> {
    let link = wide(path);
    let executable = wide(executable);
    let app_id: Vec<u16> = id.encode_utf16().chain([0]).collect();
    unsafe {
        let shortcut: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        shortcut.SetPath(PCWSTR(executable.as_ptr()))?;
        shortcut.SetDescription(w!("Focus Matrix"))?;
        let properties: IPropertyStore = shortcut.cast()?;
        let pwsz: PWSTR = SHStrDupW(PCWSTR(app_id.as_ptr()))?;
        let mut value = PROPVARIANT { Anonymous: PROPVARIANT_0 { Anonymous: ManuallyDrop::new(PROPVARIANT_0_0 {
            vt: VT_LPWSTR, Anonymous: PROPVARIANT_0_0_0 { pwszVal: pwsz }, ..Default::default()
        }) } };
        let result = properties.SetValue(&APPLICATION_ID, &value);
        PropVariantClear(&mut value)?;
        result?;
        properties.Commit()?;
        shortcut.cast::<IPersistFile>()?.Save(PCWSTR(link.as_ptr()), true)
    }
}

pub fn show(id: &str, title: &str, body: &str) -> Result<(), String> {
    let _apartment = Apartment::enter().map_err(|error| error.to_string())?;
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let shortcut = start_menu().map_err(|error| error.to_string())?.join(format!("Focus Matrix ({id}).lnk"));
    // Windows uses the Start Menu shortcut to recognize unpackaged desktop toasts.
    if !shortcut.is_file() {
        create_shortcut(&shortcut, &executable, id).map_err(|error| error.to_string())?;
        let path = wide(&shortcut);
        unsafe { SHChangeNotify(SHCNE_CREATE, SHCNF_PATHW | SHCNF_FLUSH, Some(path.as_ptr().cast()), None); }
    }
    send_toast(id, title, body).map_err(|error| error.to_string())
}

fn send_toast(id: &str, title: &str, body: &str) -> windows::core::Result<()> {
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(id))?;
    if notifier.Setting()? != NotificationSetting::Enabled {
        return Err(Error::new(E_FAIL, "Windows 通知设置未允许 Focus Matrix 提醒"));
    }
    let xml = ToastNotificationManager::GetTemplateContent(ToastTemplateType::ToastText02)?;
    let fields = xml.GetElementsByTagName(&HSTRING::from("text"))?;
    for (index, text) in [title, body].into_iter().enumerate() {
        fields.Item(index as u32)?.AppendChild(&xml.CreateTextNode(&HSTRING::from(text))?)?;
    }
    notifier.Show(&ToastNotification::CreateToastNotification(&xml)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::System::Com::STGM_READ;

    #[test]
    fn shortcut_persists_notification_identity() {
        let _apartment = Apartment::enter().unwrap();
        let path = std::env::temp_dir().join(format!("focus-matrix-notification-{}.lnk", std::process::id()));
        let id = "com.focusmatrix.notificationtest";
        create_shortcut(&path, &std::env::current_exe().unwrap(), id).unwrap();
        let link = wide(&path);
        unsafe {
            let shortcut: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
            shortcut.cast::<IPersistFile>().unwrap().Load(PCWSTR(link.as_ptr()), STGM_READ).unwrap();
            let mut property = shortcut.cast::<IPropertyStore>().unwrap().GetValue(&APPLICATION_ID).unwrap();
            let stored = &*property.Anonymous.Anonymous;
            assert_eq!(stored.vt, VT_LPWSTR);
            assert_eq!(stored.Anonymous.pwszVal.to_string().unwrap(), id);
            PropVariantClear(&mut property).unwrap();
        }
        std::fs::remove_file(path).unwrap();
    }
}
