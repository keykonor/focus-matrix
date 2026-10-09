import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-proxy-server','--remote-debugging-port=9247',`--user-data-dir=${join(process.cwd(),'.edge-cloud-startup-check')}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket,id=0;const pending=new Map(),errors=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}throw Error('Timed out: '+expression+'; '+JSON.stringify(errors)+'; '+await evaluate('document.body.innerText'));};
const open=async scenario=>{await send('Page.navigate',{url:`http://127.0.0.1:1420/cloud-startup-preview.html?scenario=${scenario}`});await wait('document.querySelector("#test-state")');};
try{
 let page;for(let i=0;i<60;i++){try{page=(await(await fetch('http://127.0.0.1:9247/json/list')).json())[0];}catch{}if(page)break;await delay(100);}assert.ok(page);
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));socket.addEventListener('message',({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);});await send('Runtime.enable');
 await open('delay');await wait(`document.body.textContent.includes('正在读取已保存的云端配置')`);await wait(`document.querySelector('.device-row')?.textContent.includes('原手机')`);
 await open('read-error');await wait(`document.body.textContent.includes('云端配置读取失败')`);assert.ok(await evaluate(`document.body.textContent.includes('Windows 无法读取或加密分享凭据')`));
 await open('retry');await wait(`document.body.textContent.includes('云端配置读取失败')`);await evaluate(`document.querySelector('.cloud-message button').click()`);await wait(`document.body.textContent.includes('云端连接正常')`);assert.equal(await evaluate('JSON.parse(document.querySelector("#test-state").textContent).reads'),2);
 await open('missing');await wait(`document.body.textContent.includes('本机尚未保存云端写入凭据')`);assert.equal(await evaluate('JSON.parse(document.querySelector("#test-state").textContent).syncs'),0);
 await open('preview');await wait(`document.body.textContent.includes('当前为浏览器预览')`);
 await open('offline');await wait(`document.querySelector('.cloud-status')?.textContent.includes('连接云端超时')`);assert.ok(await evaluate(`document.querySelector('.device-row').textContent.includes('原手机')`));
 await send('Page.reload');await wait(`document.querySelector('.device-row')?.textContent.includes('原手机')`);await wait(`document.querySelector('.cloud-status')?.textContent.includes('连接云端超时')`);
 await open('apply-error');await wait(`document.querySelector('.cloud-status')?.textContent.includes('历史保存失败')`);assert.ok(await evaluate(`document.querySelector('.device-row').textContent.includes('原手机')`));
 for(const [width,height] of [[520,360],[720,480],[1200,760]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  assert.ok(await evaluate(`(()=>{const m=document.querySelector('.cloud-modal'),r=m.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&m.scrollWidth<=m.clientWidth+1})()`));
 }
 console.log('PASS: startup loading, read failure/retry before save, missing credentials, preview, offline binding/reload, failed delivery, 3 window sizes');
}finally{socket?.close();browser.kill();}
