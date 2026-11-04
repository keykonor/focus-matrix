#[cfg(test)]
mod tests {
    use super::safe_web_url;

    #[test]
    fn accepts_web_links_and_rejects_commands_and_embedded_credentials() {
        assert!(safe_web_url("https://example.org/a").is_ok());
        assert!(safe_web_url("http://example.org/").is_ok());
        assert!(safe_web_url("file:///C:/example.exe").is_err());
        assert!(safe_web_url("javascript:alert(1)").is_err());
        assert!(safe_web_url("https://user:password@example.org/").is_err());
    }
}

fn safe_web_url(value: &str) -> Result<(), String> {
    if value.chars().any(char::is_control) { return Err("链接格式无效".into()); }
    let url = reqwest::Url::parse(value).map_err(|_| "链接格式无效")?;
    if !["http", "https"].contains(&url.scheme()) || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
        return Err("只允许打开不含登录信息的网页链接".into());
    }
    Ok(())
}

#[cfg(windows)]
#[link(name = "shell32")]
unsafe extern "system" {
    fn ShellExecuteW(hwnd: isize, operation: *const u16, file: *const u16, parameters: *const u16, directory: *const u16, show: i32) -> isize;
}

#[tauri::command]
pub fn open_task_link(url: String) -> Result<(), String> {
    safe_web_url(&url)?;
    open_target(&url)
}
pub(crate) fn open_target(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        let verb: Vec<u16> = "open\0".encode_utf16().collect();
        let target: Vec<u16> = format!("{url}\0").encode_utf16().collect();
        let result = unsafe { ShellExecuteW(0, verb.as_ptr(), target.as_ptr(), std::ptr::null(), std::ptr::null(), 1) };
        if result <= 32 { return Err("无法打开，请检查电脑的默认应用设置".into()); }
        Ok(())
    }
    #[cfg(not(windows))]
    { Err("此功能目前仅支持 Windows".into()) }
}
