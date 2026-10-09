use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, time::Duration};
use tauri::Manager;
const PUBLIC_CLOUD_CONFIG:&str=include_str!("../../cloud-site/lib/publicCloudConfig.json");
fn service_origin()-> &'static str {static ORIGIN:std::sync::OnceLock<String>=std::sync::OnceLock::new();ORIGIN.get_or_init(||serde_json::from_str::<Value>(PUBLIC_CLOUD_CONFIG).expect("public cloud configuration")["apiOrigin"].as_str().expect("cloud origin").to_owned()).as_str()}
const CONFIG:&str=".cloud-config.bin";
#[derive(Default)]pub struct CloudState(pub tokio::sync::Mutex<Runtime>);
#[derive(Default)]pub struct Runtime{share_fingerprint:String,error:Option<String>}
fn yes()->bool{true}
#[derive(Serialize,Deserialize)]#[serde(rename_all="camelCase")]
struct Config{writer_key:String,view_token:String,enabled:bool,last_synced_at:Option<u64>,#[serde(default="yes")]editing_enabled:bool,#[serde(default)]base:Option<Value>,#[serde(default)]client_id:String,#[serde(default)]pending:Option<Value>,#[serde(default)]delivery:Option<Delivery>,#[serde(default)]phone_connection:PhoneConnection}
#[derive(Clone,Default,Serialize,Deserialize)]#[serde(rename_all="camelCase")]
struct PhoneConnection{pairing:Option<PairingLink>,devices:Vec<MobileDevice>,checked_at:Option<u64>}
#[derive(Clone,Serialize,Deserialize)]#[serde(rename_all="camelCase")]
struct PairingLink{pairing_url:String,expires_at:u64}
#[derive(Clone,Serialize,Deserialize)]
struct MobileDevice{id:String,label:String,revoked:u8}
#[derive(Clone,Serialize,Deserialize)]#[serde(rename_all="camelCase")]
pub struct Delivery{request_id:String,sent_content:Value,snapshot:Value,conflicts:u64}
#[derive(Serialize)]#[serde(rename_all="camelCase")]
pub struct Status{configured:bool,enabled:bool,editing_enabled:bool,share_url:Option<String>,last_synced_at:Option<u64>,error:Option<String>,delivery:Option<Delivery>,phone_connection:PhoneConnection}
#[repr(C)]struct Blob{len:u32,data:*mut u8}
#[link(name="crypt32")]extern "system"{fn CryptProtectData(input:*const Blob,description:*const u16,entropy:*const Blob,reserved:*mut std::ffi::c_void,prompt:*mut std::ffi::c_void,flags:u32,output:*mut Blob)->i32;fn CryptUnprotectData(input:*const Blob,description:*mut *mut u16,entropy:*const Blob,reserved:*mut std::ffi::c_void,prompt:*mut std::ffi::c_void,flags:u32,output:*mut Blob)->i32;}
#[link(name="kernel32")]extern "system"{fn LocalFree(memory:*mut std::ffi::c_void)->*mut std::ffi::c_void;}
fn protect(bytes:&[u8],encrypt:bool)->Result<Vec<u8>,String>{let input=Blob{len:bytes.len().try_into().map_err(|_|"凭据过大")?,data:bytes.as_ptr() as *mut u8};let mut output=Blob{len:0,data:std::ptr::null_mut()};let ok=unsafe{if encrypt{CryptProtectData(&input,std::ptr::null(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),1,&mut output)}else{CryptUnprotectData(&input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),1,&mut output)}};if ok==0{return Err("Windows 无法读取或加密分享凭据".into());}let result=unsafe{std::slice::from_raw_parts(output.data,output.len as usize).to_vec()};unsafe{LocalFree(output.data.cast());}Ok(result)}
fn path(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{Ok(app.path().app_data_dir().map_err(|e|e.to_string())?.join(CONFIG))}
fn read_config(app:&tauri::AppHandle)->Result<Option<Config>,String>{let bytes=match fs::read(path(app)?){Ok(bytes)=>bytes,Err(error) if error.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(_)=>return Err("无法读取分享凭据，请检查应用数据目录的访问权限".into())};serde_json::from_slice(&protect(&bytes,false)?).map(Some).map_err(|_|"分享凭据损坏，原有备份已保留".into())}
fn write_config(app:&tauri::AppHandle,config:&Config)->Result<(),String>{let path=path(app)?;let bytes=serde_json::to_vec(config).map_err(|_|"分享凭据编码失败")?;let encrypted=protect(&bytes,true)?;use std::io::Write;let previous=if path.exists(){Some(fs::read(&path).map_err(|_|"无法读取原有分享凭据")?)}else{None};let durable=|target:&std::path::Path,data:&[u8]|->std::io::Result<()>{let mut file=fs::File::create(target)?;file.write_all(data)?;file.sync_all()};if let Some(bytes)=previous.as_ref(){durable(&path.with_file_name(".cloud-config.previous.bin"),bytes).map_err(|_|"无法备份原有分享凭据")?;}let result=durable(&path,&encrypted).and_then(|_|{if fs::read(&path)?!=encrypted{return Err(std::io::Error::other("verification failed"));}Ok(())});if result.is_err(){if let Some(bytes)=previous{let _=durable(&path,&bytes);}return Err("无法保存分享凭据，原有加密备份已保留".into());}Ok(())}
fn token()->Result<String,String>{let mut bytes=[0u8;32];getrandom::fill(&mut bytes).map_err(|_|"无法生成链接")?;Ok(bytes.iter().map(|b|format!("{b:02x}")).collect())}
fn status(config:Option<&Config>,error:Option<String>)->Status{Status{configured:config.is_some(),enabled:config.is_some_and(|c|c.enabled),editing_enabled:config.is_some_and(|c|c.editing_enabled),share_url:config.filter(|c|c.enabled).map(|c|format!("{}/#{}",service_origin(),c.view_token)),last_synced_at:config.and_then(|c|c.last_synced_at),error,delivery:config.and_then(|c|c.delivery.clone()),phone_connection:config.map(|c|c.phone_connection.clone()).unwrap_or_default()}}
fn client()->Result<reqwest::Client,String>{reqwest::Client::builder().connect_timeout(Duration::from_secs(5)).timeout(Duration::from_secs(15)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"无法建立云端连接".into())}
fn request_error(error:reqwest::Error)->String{
 if error.is_timeout(){"连接云端超时，请检查网络或系统代理；本地内容和手机绑定仍保留".into()}
 else if error.is_connect(){"无法建立云端连接，请检查网络、域名解析或系统代理；本地内容和手机绑定仍保留".into()}
 else{"云端网络请求失败，稍后自动重试；本地内容和手机绑定仍保留".into()}
}
fn http_error(code:u16)->String{match code{
 401=>"云端拒绝了同步凭据（HTTP 401），请核对原账户配置；手机绑定仍保留".into(),
 403=>"云端托管入口或权限拒绝了请求（HTTP 403），内容和手机绑定仍保留".into(),
 404=>"云端 API 地址或路由不存在（HTTP 404），请检查服务部署；本地内容仍保留".into(),
 500..=599=>format!("云端服务暂不可用（HTTP {code}），稍后自动重试；手机绑定仍保留"),
 _=>format!("云端请求失败（HTTP {code}），本地内容和手机绑定仍保留")
}}
async fn response_json(response:reqwest::Response)->Result<Value,String>{if !response.status().is_success(){return Err(http_error(response.status().as_u16()));}response.json().await.map_err(|_|"云端返回的不是有效 JSON，请检查 API 地址或托管入口".into())}
async fn share(config:&Config,runtime:&mut Runtime)->Result<(),String>{let fingerprint=format!("{}:{}:{}",config.view_token,config.enabled,config.editing_enabled);if runtime.share_fingerprint==fingerprint{return Ok(());}let request=if config.enabled{client()?.put(format!("{}/api/plan",service_origin())).json(&json!({"viewToken":config.view_token,"editingEnabled":config.editing_enabled}))}else{client()?.delete(format!("{}/api/plan",service_origin()))};response_json(request.bearer_auth(&config.writer_key).send().await.map_err(request_error)?).await?;runtime.share_fingerprint=fingerprint;Ok(())}
fn valid_content(value:&Value)->bool{value.get("tasks").is_some_and(Value::is_array)&&value.get("dailyMemos").is_some_and(Value::is_object)}
async fn synchronize(app:&tauri::AppHandle,config:&mut Config,runtime:&mut Runtime,content:Value)->Result<(),String>{if !valid_content(&content){return Err("本地内容格式无效".into());}share(config,runtime).await?;if config.delivery.is_some(){return Ok(());}if config.client_id.is_empty(){config.client_id=token()?;}
 let base=config.base.clone().unwrap_or(json!({"tasks":[],"dailyMemos":{}}));
 let request=if let Some(pending)=config.pending.clone(){pending}else{let next=json!({"base":base,"content":content,"clientId":config.client_id,"requestId":token()?,"actor":"电脑"});config.pending=Some(next.clone());write_config(app,config)?;next};
 // Persist the exact request and response until React has durably applied them.
 let response=if config.base.is_some()&&request["base"]==request["content"]{client()?.get(format!("{}/api/sync",service_origin())).bearer_auth(&config.writer_key).send().await}else{client()?.post(format!("{}/api/sync",service_origin())).bearer_auth(&config.writer_key).json(&request).send().await}.map_err(request_error)?;
 let body=response_json(response).await?;let snapshot=body.get("snapshot").ok_or("云端响应无效")?;if !snapshot.get("content").is_some_and(valid_content)||!snapshot.get("revision").is_some_and(Value::is_u64){return Err("云端内容格式无效".into());}
 config.delivery=Some(Delivery{request_id:request["requestId"].as_str().ok_or("请求编号无效")?.into(),sent_content:request["content"].clone(),snapshot:snapshot.clone(),conflicts:body["conflicts"].as_u64().unwrap_or(0)});write_config(app,config)?;Ok(())}
#[tauri::command]pub async fn get_cloud_status(app:tauri::AppHandle,state:tauri::State<'_,CloudState>)->Result<Status,String>{let runtime=state.0.lock().await;Ok(status(read_config(&app)?.as_ref(),runtime.error.clone()))}
#[tauri::command]pub async fn configure_cloud(app:tauri::AppHandle,state:tauri::State<'_,CloudState>,writer_key:String)->Result<Status,String>{let mut runtime=state.0.lock().await;if writer_key.len()!=64||!writer_key.bytes().all(|b|b.is_ascii_hexdigit()){return Err("凭据格式无效".into());}let mut config=read_config(&app)?.unwrap_or(Config{writer_key:String::new(),view_token:token()?,enabled:false,last_synced_at:None,editing_enabled:true,base:None,client_id:String::new(),pending:None,delivery:None,phone_connection:PhoneConnection::default()});if !config.writer_key.is_empty()&&config.writer_key!=writer_key{return Err("不可替换已有同步账户".into());}config.writer_key=writer_key;write_config(&app,&config)?;runtime.error=None;Ok(status(Some(&config),None))}
#[tauri::command]pub async fn sync_cloud(app:tauri::AppHandle,state:tauri::State<'_,CloudState>,content:Value)->Result<Status,String>{let mut runtime=state.0.lock().await;let mut config=read_config(&app)?;if let Some(config)=config.as_mut(){runtime.error=synchronize(&app,config,&mut runtime,content).await.err();}Ok(status(config.as_ref(),runtime.error.clone()))}
#[tauri::command]pub async fn ack_cloud_applied(app:tauri::AppHandle,state:tauri::State<'_,CloudState>,request_id:String,revision:u64)->Result<Status,String>{let runtime=state.0.lock().await;let mut config=read_config(&app)?.ok_or("尚未配置")?;let delivery=config.delivery.as_ref().ok_or("没有待确认的同步")?;if delivery.request_id!=request_id||delivery.snapshot["revision"].as_u64()!=Some(revision){return Err("同步确认不匹配".into());}config.base=Some(delivery.snapshot["content"].clone());config.last_synced_at=delivery.snapshot["updatedAt"].as_u64();config.pending=None;config.delivery=None;write_config(&app,&config)?;Ok(status(Some(&config),runtime.error.clone()))}
#[tauri::command]pub async fn set_cloud_sharing(app:tauri::AppHandle,state:tauri::State<'_,CloudState>,enabled:bool)->Result<Status,String>{let mut runtime=state.0.lock().await;let mut config=read_config(&app)?.ok_or("尚未配置云端")?;let old=config.enabled;config.enabled=enabled;share(&config,&mut runtime).await?;if old&&!enabled{config.view_token=token()?;}write_config(&app,&config)?;runtime.error=None;Ok(status(Some(&config),None))}
#[tauri::command]pub async fn set_share_editing(app:tauri::AppHandle,state:tauri::State<'_,CloudState>,enabled:bool)->Result<Status,String>{let mut runtime=state.0.lock().await;let mut config=read_config(&app)?.ok_or("尚未配置云端")?;config.editing_enabled=enabled;share(&config,&mut runtime).await?;write_config(&app,&config)?;runtime.error=None;Ok(status(Some(&config),None))}
#[tauri::command]pub async fn rotate_cloud_link(app:tauri::AppHandle,state:tauri::State<'_,CloudState>)->Result<Status,String>{let mut runtime=state.0.lock().await;let mut config=read_config(&app)?.ok_or("尚未配置云端")?;if !config.enabled{return Err("请先开启分享".into());}config.view_token=token()?;share(&config,&mut runtime).await?;write_config(&app,&config)?;runtime.error=None;Ok(status(Some(&config),None))}
#[tauri::command]pub async fn create_mobile_pairing(app:tauri::AppHandle,state:tauri::State<'_,CloudState>)->Result<Value,String>{let _runtime=state.0.lock().await;let mut config=read_config(&app)?.ok_or("尚未配置云端")?;let body=response_json(client()?.post(format!("{}/api/devices/pair",service_origin())).bearer_auth(&config.writer_key).send().await.map_err(request_error)?).await?;let link:PairingLink=serde_json::from_value(body.clone()).map_err(|_|"配对链接格式无效")?;config.phone_connection.pairing=Some(link);write_config(&app,&config)?;Ok(body)}
#[tauri::command]pub async fn list_mobile_devices(app:tauri::AppHandle,state:tauri::State<'_,CloudState>)->Result<Value,String>{let _runtime=state.0.lock().await;let mut config=read_config(&app)?.ok_or("尚未配置云端")?;let remote=async{let body=response_json(client()?.get(format!("{}/api/devices",service_origin())).bearer_auth(&config.writer_key).send().await.map_err(request_error)?).await?;serde_json::from_value::<Vec<MobileDevice>>(body["devices"].clone()).map_err(|_|"设备列表格式无效".to_string())}.await;match remote{Ok(devices)=>{config.phone_connection.devices=devices;config.phone_connection.checked_at=Some(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|"时间无效")?.as_millis() as u64);write_config(&app,&config)?;Ok(json!({"devices":config.phone_connection.devices,"checkedAt":config.phone_connection.checked_at,"cached":false}))},Err(error)=>Ok(json!({"devices":config.phone_connection.devices,"checkedAt":config.phone_connection.checked_at,"cached":true,"error":error}))}}
#[tauri::command]pub async fn revoke_mobile_device(app:tauri::AppHandle,state:tauri::State<'_,CloudState>,id:String)->Result<Value,String>{let _runtime=state.0.lock().await;let mut config=read_config(&app)?.ok_or("尚未配置云端")?;let body=response_json(client()?.delete(format!("{}/api/devices",service_origin())).bearer_auth(&config.writer_key).json(&json!({"id":id})).send().await.map_err(request_error)?).await?;for device in &mut config.phone_connection.devices{if device.id==id{device.revoked=1;}}write_config(&app,&config)?;Ok(body)}
#[tauri::command]pub async fn get_cloud_changes(app:tauri::AppHandle,state:tauri::State<'_,CloudState>,before:Option<u64>)->Result<Value,String>{let _runtime=state.0.lock().await;let config=read_config(&app)?.ok_or("尚未配置云端")?;let suffix=before.map(|n|format!("?before={n}")).unwrap_or_default();response_json(client()?.get(format!("{}/api/changes{suffix}",service_origin())).bearer_auth(&config.writer_key).send().await.map_err(request_error)?).await}
#[cfg(test)]mod tests{use super::*;#[test]fn windows_credentials_are_encrypted(){let input=b"test-write-key";let encrypted=protect(input,true).unwrap();assert_ne!(encrypted,input);assert_eq!(protect(&encrypted,false).unwrap(),input);}#[test]fn links_use_distinct_random_tokens(){let first=token().unwrap();let second=token().unwrap();assert_eq!(first.len(),64);assert_ne!(first,second);}#[test]fn previous_config_keeps_its_keys(){let config:Config=serde_json::from_value(json!({"writerKey":"old","viewToken":"same","enabled":true,"lastSyncedAt":123})).unwrap();assert_eq!(config.writer_key,"old");assert_eq!(config.view_token,"same");assert!(config.editing_enabled);assert!(config.base.is_none());}}

#[cfg(test)]mod phone_tests{
 use super::*;
 #[test]fn old_installation_has_safe_empty_phone_cache(){
  let config:Config=serde_json::from_value(json!({"writerKey":"old","viewToken":"same","enabled":true,"lastSyncedAt":123})).unwrap();
  assert!(config.phone_connection.pairing.is_none());assert!(config.phone_connection.devices.is_empty());
 }
 #[test]fn encrypted_restart_keeps_phone_binding_even_when_invitation_expired(){
  let original=json!({"writerKey":"private","viewToken":"public","enabled":true,"lastSyncedAt":123,"pending":{"requestId":"keep"},"phoneConnection":{"pairing":{"pairingUrl":"test-link","expiresAt":1},"devices":[{"id":"phone-id","label":"我的手机","revoked":0}],"checkedAt":456}});
  let config:Config=serde_json::from_value(original).unwrap();let encrypted=protect(&serde_json::to_vec(&config).unwrap(),true).unwrap();
  let restored:Config=serde_json::from_slice(&protect(&encrypted,false).unwrap()).unwrap();
  let offline=status(Some(&restored),Some("offline".into()));
  assert_eq!(offline.phone_connection.devices[0].revoked,0);assert_eq!(offline.phone_connection.devices[0].label,"我的手机");
  assert_eq!(restored.pending.unwrap()["requestId"],"keep");assert_eq!(restored.writer_key,"private");
 }
}

#[cfg(test)]mod diagnostic_tests{
 use super::*;
 #[test]fn errors_distinguish_credentials_routes_and_service_failure(){
  assert!(http_error(401).contains("凭据"));assert!(http_error(403).contains("权限"));
  assert!(http_error(404).contains("路由"));assert!(http_error(503).contains("服务暂不可用"));
 }
 #[test]fn public_status_never_exposes_write_credentials_or_pending_requests(){
  let config:Config=serde_json::from_value(json!({"writerKey":"private-key","viewToken":"same","enabled":false,"lastSyncedAt":123,"pending":{"secret":"pending-content"}})).unwrap();
  let public=serde_json::to_string(&status(Some(&config),Some(http_error(401)))).unwrap();
  assert!(!public.contains("private-key"));assert!(!public.contains("pending-content"));assert!(!public.contains("writerKey"));
 }
 #[test]fn html_response_is_not_accepted_as_cloud_success(){
  use std::io::{Read,Write};
  let listener=std::net::TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
  let server=std::thread::spawn(move||{let(mut stream,_)=listener.accept().unwrap();stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();let mut request=[0u8;4096];stream.read(&mut request).unwrap();stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 7\r\nConnection: close\r\n\r\n<html/>").unwrap();});
  let result=tauri::async_runtime::block_on(async{let response=reqwest::Client::builder().no_proxy().build().unwrap().get(format!("http://{address}")).send().await.unwrap();response_json(response).await});
  assert!(result.unwrap_err().contains("有效 JSON"));server.join().unwrap();
 }
}
