import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9240',`--user-data-dir=${join(process.cwd(),'.edge-cloud-check')}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket,nextId=0;const pending=new Map(),errors=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const res=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(res.exceptionDetails)throw Error(JSON.stringify(res.exceptionDetails));return res.result.value;};
const waitFor=async expression=>{for(let i=0;i<80;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}throw Error(`等待失败 ${expression}; 错误 ${JSON.stringify(errors)}; 页面 ${await evaluate('document.body.innerText')}`);};
const fits=()=>evaluate(`(()=>{const root=document.documentElement;return root.scrollWidth<=innerWidth&&[...document.querySelectorAll('header,.settings-modal,.quadrant,.periods')].every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})})()`);
try{
 let page;for(let i=0;i<60;i++){try{page=(await(await fetch('http://127.0.0.1:9240/json/list')).json())[0];}catch{}if(page)break;await delay(100);}assert.ok(page);
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));socket.addEventListener('message',({data})=>{const msg=JSON.parse(data),p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);});
 await send('Runtime.enable');await mkdir('outputs',{recursive:true});
 await send('Page.navigate',{url:'http://127.0.0.1:1420/calendar-preview.html'});await waitFor("document.querySelector('.cloud-button')?.disabled===false");
 await evaluate("document.querySelector('.cloud-button').click()");await waitFor("document.querySelector('.cloud-modal')");
 for(const [width,height] of [[720,480],[520,360],[1200,760]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);assert.ok(await fits(),`桌面布局 ${width}×${height}`);}
 await writeFile('outputs/cloud-desktop.png',Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
 await evaluate("document.querySelector('[aria-label=\"分享我的计划\"]').click()");await waitFor("document.querySelector('#cloud-link')");
 assert.ok(await evaluate("document.querySelector('#cloud-link').value.startsWith('https://')"));
 await send('Page.navigate',{url:`http://127.0.0.1:5182/#${'b'.repeat(64)}`});await waitFor("document.querySelectorAll('.quadrant').length===4");
 for(const [width,height] of [[1440,900],[720,480],[390,844]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);assert.ok(await fits(),`云端布局 ${width}×${height}`);}
 assert.ok(await evaluate("document.querySelector('li').textContent.includes('全部内容应完整显示')"));
 await writeFile('outputs/cloud-mobile.png',Buffer.from((await send('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'));
 await evaluate("[...document.querySelectorAll('nav button')].find(e=>e.textContent==='日期备忘录').click()");await waitFor("document.querySelector('.periods')");
 await evaluate(`(()=>{const input=document.querySelector('input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-10-06');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(250);
 assert.equal(await evaluate("document.querySelectorAll('.periods section').length"),3);assert.ok(await fits());
 await send('Page.navigate',{url:'http://127.0.0.1:5182/'});await waitFor("document.body.textContent.includes('请使用桌面软件')");assert.equal(await evaluate("document.querySelectorAll('li').length"),0);
 assert.deepEqual(errors,[]);console.log('桌面分享弹窗、小窗口、手机/电脑布局、完整换行、无链接不显示数据：通过');
}finally{socket?.close();browser.kill();}
