// Accept the writer key only on hidden stdin. Never log it or store it as plaintext.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
const readKey=()=>new Promise((resolve,reject)=>{
 console.log('Ready for encrypted cloud provisioning input (hidden).');
 let buffer='';const terminal=!!process.stdin.isTTY;
 if(terminal)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.resume();
 const clean=()=>{process.stdin.off('data',receive);if(terminal)process.stdin.setRawMode(false);process.stdin.pause();};
 const receive=chunk=>{if(chunk.includes('\u0003')){clean();reject(Error('Cancelled'));return;}buffer+=chunk;if(!buffer.includes('\n')&&!buffer.includes('\r'))return;clean();try{const key=JSON.parse(buffer.trim()).writerKey;assert.match(key,/^[a-f0-9]{64}$/);resolve(key);}catch{reject(Error('Invalid provisioning input'));}};
 process.stdin.on('data',receive);
});
const key=process.argv.includes('--check')?null:await readKey();
let page;for(let i=0;i<80;i++){try{page=(await(await fetch('http://127.0.0.1:9236/json/list')).json()).find(p=>p.type==='page'&&p.url.startsWith('http://tauri.localhost'));}catch{}if(page)break;await delay(100);}assert.ok(page,'Installed WebView not found');
const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let nextId=0;const pending=new Map();
socket.addEventListener('message',({data})=>{const msg=JSON.parse(data),p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error('WebView command failed')):p.resolve(msg.result);}});
const evaluate=expression=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve:r=>r.exceptionDetails?reject(Error(`Native provisioning failed: ${r.exceptionDetails.exception?.description??r.exceptionDetails.exception?.value??r.exceptionDetails.text}`)):resolve(r.result.value),reject});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
const invoke=(command,args={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
const origin='https://focus-matrix-plans-17154.just-bard-2476.chatgpt.site';
const content=async()=>{const data=JSON.parse(await readFile(join(process.env.APPDATA,'com.focusmatrix.desktop','focus-matrix.json'),'utf8'));return {tasks:data.tasks,dailyMemos:data.dailyMemos??{}};};
const readerGet=token=>fetch(`${origin}/api/plan`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
const confirm=async status=>{
 assert.ok(status.enabled&&status.shareUrl&&status.lastSyncedAt&&!status.error,'Cloud did not acknowledge synchronization');
 const response=await readerGet(new URL(status.shareUrl).hash.slice(1));assert.equal(response.status,200,'Share link did not work anonymously');
 const data=await response.json();assert.ok(isDeepStrictEqual(data.content,await content()),'Cloud content differs from saved local tasks/memos');
 assert.ok(!('settings' in data.content)&&!('history' in data.content),'Unexpected private settings in cloud');
};
try{
 for(let attempt=0;attempt<80;attempt++){if(await evaluate("Boolean(window.__TAURI_INTERNALS__?.invoke && document.querySelector('.cloud-button')?.disabled===false)"))break;if(attempt===79)throw Error('Installed app did not finish loading');await delay(100);}
 if(key)await invoke('configure_cloud',{writerKey:key});
 if(key)await invoke('set_cloud_sharing',{enabled:true});
 await evaluate("window.dispatchEvent(new Event('focus-matrix:content-saved'))");
 let status;for(let i=0;i<80;i++){status=await invoke('get_cloud_status');if(status.lastSyncedAt&&!status.error&&!status.delivery)break;await delay(500);}
 await confirm(status);assert.equal((await fetch(`${origin}/api/plan`)).status,404);
 const oldToken=new URL(status.shareUrl).hash.slice(1);
 assert.equal((await fetch(`${origin}/api/plan`,{method:'PUT',headers:{Authorization:`Bearer ${oldToken}`},body:'{}'})).status,401,'Reader can write');
 if(key){
  status=await invoke('rotate_cloud_link');await confirm(status);assert.equal((await readerGet(oldToken)).status,404,'Old link still works');
  const rotatedToken=new URL(status.shareUrl).hash.slice(1);status=await invoke('set_cloud_sharing',{enabled:false});assert.equal(status.enabled,false);assert.equal((await readerGet(rotatedToken)).status,404,'Revoked share still works');
  status=await invoke('set_cloud_sharing',{enabled:true});await confirm(status);
 }
 await evaluate("window.dispatchEvent(new Event('focus-matrix:content-saved'))");await delay(1800);
 await evaluate("document.querySelector('.cloud-button').click()");await delay(250);
 console.log(JSON.stringify({verified:true,taskCount:(await content()).tasks.length,shareUrl:status.shareUrl,lastSyncedAt:status.lastSyncedAt}));
}finally{socket.close();await delay(100);}
