use serde::Deserialize;
use serde_json::{json, Value};
use std::{sync::Mutex, time::Duration};
#[cfg(windows)]
use std::{path::PathBuf, process::Child};

const DEFAULT_OLLAMA: &str = "http://127.0.0.1:11434";
const FOCUS_OLLAMA: &str = "http://127.0.0.1:11435";
#[cfg(windows)]
static MANAGED_OLLAMA: Mutex<Option<(u16, Child)>> = Mutex::new(None);
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
async fn ollama_endpoint(client: &reqwest::Client) -> Result<String, String> {
    use std::{io::ErrorKind, os::windows::process::CommandExt, process::{Command, Stdio}};

    let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) else {
        return Ok(DEFAULT_OLLAMA.into());
    };
    let lock: Value = serde_json::from_str(include_str!("../../scripts/local-ai-lock.json"))
        .map_err(|_| "本机识别版本配置无效。")?;
    let runtime_version = lock["runtimeVersion"].as_str().ok_or("本机识别版本配置无效。")?;
    let offline = local.join("FocusMatrixLocalAI");
    let bundled = offline.join(format!("ollama-{runtime_version}")).join("ollama.exe");
    let manifest = offline.join("models/manifests/registry.ollama.ai/library/qwen3.5/4b-q4_K_M");
    if bundled.is_file() && manifest.is_file() {
        let port = {
            let mut managed = MANAGED_OLLAMA.lock().map_err(|_| "本机识别状态不可用。")?;
            let running_port = if let Some((port, child)) = managed.as_mut() {
                child.try_wait().map_err(|_| "无法检查离线识别进程。")?.is_none().then_some(*port)
            } else { None };
            if let Some(port) = running_port { port } else {
                let address = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
                    .and_then(|socket| socket.local_addr()).map_err(|_| "无法分配本机识别端口。")?;
                let child = Command::new(&bundled).arg("serve")
                    .env("OLLAMA_MODELS", offline.join("models"))
                    .env("OLLAMA_HOST", address.to_string()).env("OLLAMA_NO_CLOUD", "1")
                    .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
                    .creation_flags(0x08000000).spawn().map_err(|_| "无法启动离线 Ollama，请重新运行离线安装。")?;
                *managed = Some((address.port(), child));
                address.port()
            }
        };
        let endpoint = format!("http://127.0.0.1:{port}");
        for _ in 0..50 {
            if available(client, &endpoint).await { return Ok(endpoint); }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        stop_managed_ollama();
        return Err("离线识别启动失败，请检查离线运行时与模型安装。".into());
    }
    let config = local.join("FocusMatrixOllama").join("model-directory.txt");
    let models = match std::fs::read_to_string(config) {
        Ok(path) => PathBuf::from(path.trim()),
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(DEFAULT_OLLAMA.into()),
        Err(_) => return Err("无法读取本地模型目录配置。".into()),
    };
    if !models.is_absolute() || !models.is_dir() {
        return Err("Focus Matrix 本地模型目录不可用，请检查模型所在磁盘。".into());
    }
    if available(client, FOCUS_OLLAMA).await { return Ok(FOCUS_OLLAMA.into()); }
    let exe = local.join("Programs").join("Ollama").join("ollama.exe");
    let mut process = Command::new(exe).arg("serve")
        .env("OLLAMA_MODELS", models)
        .env("OLLAMA_HOST", "127.0.0.1:11435")
        .env("OLLAMA_NO_CLOUD", "1")
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .creation_flags(0x08000000)
        .spawn().map_err(|_| "无法启动本地 Ollama，请检查是否已安装。")?;
    for _ in 0..24 {
        if available(client, FOCUS_OLLAMA).await { return Ok(FOCUS_OLLAMA.into()); }
        if process.try_wait().ok().flatten().is_some() { break; }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    let _ = process.kill();
    let _ = process.wait();
    Err("本地 Ollama 启动失败，请检查模型目录和端口 11435。".into())
}

#[cfg(windows)]
pub fn stop_managed_ollama() {
    if let Ok(mut managed) = MANAGED_OLLAMA.lock() {
        if let Some((_, mut child)) = managed.take() { let _ = child.kill(); let _ = child.wait(); }
    }
}

#[cfg(windows)]
async fn available(client: &reqwest::Client, endpoint: &str) -> bool {
    client.get(format!("{endpoint}/api/version")).timeout(Duration::from_secs(1))
        .send().await.is_ok_and(|response| response.status().is_success())
}

#[tauri::command]
pub async fn install_local_chat_model() -> Result<(), String> {
    // This always targets the user's local, already installed Ollama service.
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(2)).timeout(Duration::from_secs(3600))
        .build().map_err(|_| "无法创建本机模型连接。")?;
    let response = client.post(format!("{DEFAULT_OLLAMA}/api/pull"))
        .json(&json!({"model": MODEL, "stream": false})).send().await
        .map_err(|_| "下载未完成。请启动 Ollama，确认网络和磁盘空间后重试。")?;
    if !response.status().is_success() { return Err("Ollama 下载失败，请检查网络和磁盘空间后重试。".into()); }
    let result: Value = response.json().await.map_err(|_| "无法读取 Ollama 的下载结果。")?;
    if result["status"] != "success" { return Err("Ollama 未确认模型下载成功，请重试。".into()); }
    Ok(())
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
