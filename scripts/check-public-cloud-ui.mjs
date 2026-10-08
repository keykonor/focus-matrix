import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {join} from 'node:path';
const config=JSON.parse(await readFile('cloud-site/lib/publicCloudConfig.json','utf8'));
const release=JSON.parse(await readFile('outputs/mobile-release-check.json','utf8'));
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--no-proxy-server','--disable-gpu','--disable-extensions','--no-first-run','--remote-debugging-port=9243',`--user-data-dir=${join(process.cwd(),'.edge-public-cloud-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket,id=0;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error('Browser evaluation failed');return result.result.value;};
let notice=false;
async function wait(expression){for(let attempt=0;attempt<150;attempt++){
 if(await evaluate(`Boolean(${expression})`))return;
 const accepted=await evaluate(`(()=>{const el=[...document.querySelectorAll('button,a')].find(el=>/^(确认访问|确定访问|继续访问|访问网站)$/.test(el.textContent.trim()));if(el){el.click();return true;}return false;})()`);
 notice ||= accepted;await delay(200);
}await writeFile('outputs/public-cloud-browser-failure.png',Buffer.from((await send('Page.captureScreenshot')).data,'base64'));console.log(await evaluate('document.body.innerText.slice(0,600)'));throw Error('Public page did not become ready');}
try{
 let page;for(let i=0;i<60;i++){try{page=(await(await fetch('http://127.0.0.1:9243/json/list')).json())[0];}catch{}if(page)break;await delay(100);}assert.ok(page);
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));socket.addEventListener('message',({data})=>{const msg=JSON.parse(data),p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}});
 await send('Page.navigate',{url:config.publicOrigin+'/'});
 await wait("document.querySelector('.pair-screen')");
 assert.equal(await evaluate("document.querySelectorAll('.mobile-quadrant textarea').length"),0,'Anonymous page displayed tasks');
 await send('Page.navigate',{url:release.shareUrl});
 await wait("document.querySelector('.mobile-quadrant textarea')");
 const taskCount=await evaluate("document.querySelectorAll('.mobile-quadrant textarea').length");assert.equal(taskCount,release.taskCount);
 for(const [width,height] of [[390,844],[720,480],[1200,760]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(200);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Public page horizontal overflow');
  assert.ok(await evaluate("[...document.querySelectorAll('textarea')].every(el=>el.scrollHeight<=el.clientHeight+2)"),'Task content was clipped');
 }
 await writeFile('outputs/public-cloud-desktop.png',Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
 console.log(JSON.stringify({publicBrowserVerified:true,directNetwork:true,taskCount,platformNotice:notice}));
}finally{socket?.close();browser.kill();}
