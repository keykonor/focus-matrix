import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const pages=await(await fetch('http://127.0.0.1:9236/json/list')).json();
const page=pages.find(item=>item.type==='page'&&item.url.startsWith('http://tauri.localhost'));
assert.ok(page,'安装版窗口未运行');
const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let id=0;const pending=new Map(),errors=[];
socket.addEventListener('message',({data})=>{const msg=JSON.parse(data),callback=pending.get(msg.id);if(callback){pending.delete(msg.id);msg.error?callback.reject(Error(msg.error.message)):callback.resolve(msg.result);}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}throw Error('等待失败: '+expression);};
const dataDirectory=join(process.env.APPDATA,'com.focusmatrix.desktop');
try{
 await send('Runtime.enable');
 await wait('document.querySelector(".phone-button") && !document.querySelector(".phone-button").disabled');
 await evaluate('document.querySelector(".modal-header button")?.click()');await wait('!document.querySelector(".modal-backdrop")');
 for(const [width,height] of [[1200,760],[720,480],[520,360]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await evaluate('document.querySelector(".cloud-button").click()');await wait('document.querySelector("#cloud-link")');
  assert.ok(await evaluate('document.querySelector("#cloud-link").value.startsWith("https://")'));
  assert.equal(await evaluate('document.querySelector(".cloud-tabs button").getAttribute("aria-pressed")'),'true');
  await evaluate('document.querySelector(".modal-header button").click()');await wait('!document.querySelector(".modal-backdrop")');
  await evaluate('document.querySelector(".phone-button").click()');
  await wait('document.querySelector(".phone-connection")');
  assert.ok(await evaluate('document.querySelector(".phone-connection").textContent.includes("电脑关机")'));
  assert.ok(await evaluate(`(()=>{const title=document.querySelector('.title-bar'),buttons=[...title.querySelectorAll('button')];return document.documentElement.scrollWidth<=innerWidth&&buttons.every(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=title.getBoundingClientRect().bottom;})})()`),'标题栏按钮溢出 '+width);
  assert.ok(await evaluate(`(()=>{const modal=document.querySelector('.settings-modal'),r=modal.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&modal.scrollWidth<=modal.clientWidth+1})()`),'链接窗口溢出 '+width);
  if(width===520)await writeFile('outputs/desktop-binding-minimum.png',Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
  await evaluate('document.querySelector(".modal-header button").click()');
  await wait('!document.querySelector(".modal-backdrop")');
 }
 await send('Emulation.clearDeviceMetricsOverride');
 // Native cache exposed to UI contains no account write key and survives encrypted disk reload.
 const info=await evaluate('window.__TAURI_INTERNALS__.invoke("list_mobile_devices")');assert.ok(Array.isArray(info.devices));
 const status=await evaluate('window.__TAURI_INTERNALS__.invoke("get_cloud_status")');
 assert.deepEqual(status.phoneConnection.devices,info.devices);assert.equal('writerKey' in status,false);
 const backups=(await readdir(join(dataDirectory,'backups'),{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort().reverse();
 const backup=join(dataDirectory,'backups',backups[0]);
 const prior=JSON.parse(await readFile(join(backup,'focus-matrix.json'),'utf8')),current=JSON.parse(await readFile(join(dataDirectory,'focus-matrix.json'),'utf8'));
 for(const field of ['tasks','dailyMemos','settings'])assert.deepEqual(current[field],prior[field],field+' 被更新修改');
 assert.deepEqual(JSON.parse(await readFile(join(dataDirectory,'.window-state.json'),'utf8')),JSON.parse(await readFile(join(backup,'.window-state.json'),'utf8')));
 assert.deepEqual(errors,[]);
 console.log('安装版：两种链接入口、520/720/1200 窗口无溢出、加密绑定记录和原任务/备忘录/设置/窗口状态均通过。');
}finally{await send('Emulation.clearDeviceMetricsOverride').catch(()=>undefined);socket.close();}
