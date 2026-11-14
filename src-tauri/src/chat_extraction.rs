use serde::Deserialize;
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex, time::Duration};

const DEFAULT_OLLAMA: &str = "http://127.0.0.1:11434";
const FOCUS_OLLAMA: &str = "http://127.0.0.1:11435";
const MODEL: &str = "qwen3.5:4b-q4_K_M";
const PROMPT: &str = include_str!("chat_extraction_prompt.txt");
static EXTRACTION: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);
static ACTIVE_REQUEST: Mutex<Option<(String, tokio::task::AbortHandle)>> = Mutex::new(None);

#[derive(Deserialize)]
struct ChatResponse {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

#[cfg(windows)]
async fn ollama_endpoint(client: &reqwest::Client) -> Result<&'static str, String> {
    use std::{io::ErrorKind, os::windows::process::CommandExt, process::{Command, Stdio}};

    let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) else {
        return Ok(DEFAULT_OLLAMA);
    };
    let config = local.join("FocusMatrixOllama").join("model-directory.txt");
    let models = match std::fs::read_to_string(config) {
        Ok(path) => PathBuf::from(path.trim()),
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(DEFAULT_OLLAMA),
        Err(_) => return Err("无法读取本地模型目录配置。".into()),
    };
    if !models.is_absolute() || !models.is_dir() {
        return Err("Focus Matrix 本地模型目录不可用，请检查模型所在磁盘。".into());
    }
    let available = || async {
        client.get(format!("{FOCUS_OLLAMA}/api/version"))
            .timeout(Duration::from_secs(1)).send().await.is_ok_and(|response| response.status().is_success())
    };
    if available().await { return Ok(FOCUS_OLLAMA); }
    let exe = local.join("Programs").join("Ollama").join("ollama.exe");
    let mut process = Command::new(exe).arg("serve")
        .env("OLLAMA_MODELS", models)
        .env("OLLAMA_HOST", "127.0.0.1:11435")
        .env("OLLAMA_NO_CLOUD", "1")
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .creation_flags(0x08000000)
        .spawn().map_err(|_| "无法启动本地 Ollama，请检查是否已安装。")?;
    for _ in 0..24 {
        if available().await { return Ok(FOCUS_OLLAMA); }
        if process.try_wait().ok().flatten().is_some() { break; }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    let _ = process.kill();
    let _ = process.wait();
    Err("本地 Ollama 启动失败，请检查模型目录和端口 11435。".into())
}

#[tauri::command]
pub async fn cancel_chat_extraction(request_id: String) {
    let cancelled = ACTIVE_REQUEST.lock().ok().is_some_and(|active| {
        if let Some((_, handle)) = active.as_ref().filter(|(id, _)| id == &request_id) {
            handle.abort();
            true
        } else {
            false
        }
    });
    if cancelled {
        let _permit = EXTRACTION.acquire().await;
    }
}

#[tauri::command]
pub async fn extract_chat_events(input: String, request_id: Option<String>) -> Result<String, String> {
    if input.trim().is_empty() || input.len() > 100_000 {
        return Err("聊天内容为空或过长，请分批提取。".into());
    }
    let task = {
        let mut active = ACTIVE_REQUEST.lock().map_err(|_| "本地模型状态不可用。")?;
        let permit = EXTRACTION.try_acquire().map_err(|_| "本地模型正在处理上一批，请稍候。")?;
        let task = tokio::spawn(async move {
            let _permit = permit;
            request_events(input).await
        });
        *active = request_id.as_ref().map(|id| (id.clone(), task.abort_handle()));
        task
    };
    let result = task.await;
    if let Ok(mut active) = ACTIVE_REQUEST.lock() {
        if active.as_ref().is_some_and(|(id, _)| Some(id) == request_id.as_ref()) {
            *active = None;
        }
    }
    result.map_err(|_| "提取已取消。")?
}

async fn request_events(input: String) -> Result<String, String> {
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3)).timeout(Duration::from_secs(240))
        .build().map_err(|_| "无法创建本地模型连接。")?;
    #[cfg(windows)]
    let endpoint = ollama_endpoint(&client).await?;
    #[cfg(not(windows))]
    let endpoint = DEFAULT_OLLAMA;
    let schema: Value = serde_json::from_str(include_str!("chat_extraction_schema.json").trim_start_matches('\u{feff}'))
        .map_err(|_| "本地事项格式不可用。")?;
    let response = client.post(format!("{endpoint}/api/chat")).json(&json!({
        "model": MODEL,
        "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": input}],
        "format": schema, "stream": false, "think": false, "keep_alive": "90s",
        "options": {"temperature": 0, "seed": 42, "num_ctx": 16384, "num_predict": 2200}
    })).send().await.map_err(|error| {
        if error.is_timeout() { "本地模型处理超时，请缩短聊天内容后重试。" }
        else { "无法连接本地 Ollama，请确认服务正在运行。" }
    })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("本地 Ollama 缺少 Qwen3.5 4B 模型，请检查模型部署。".into());
    }
    if !response.status().is_success() {
        return Err(format!("本地模型处理失败（{}），请检查 Ollama 后重试。", response.status()));
    }
    let response = response.json::<ChatResponse>().await.map_err(|_| "无法读取本地模型结果。")?;
    if response.message.content.trim().is_empty() || response.message.content.len() > 64_000 {
        return Err("本地模型未返回有效事项，请重试。".into());
    }
    Ok(response.message.content)
}
