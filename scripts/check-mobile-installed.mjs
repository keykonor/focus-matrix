// Production verification: no task text is edited; pair/revoke a temporary test device.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
let page;for(let i=0;i<100;i++){try{page=(await(await fetch('http://127.0.0.1:9236/json/list')).json()).find(p=>p.type==='page'&&p.url.startsWith('http://tauri.localhost'));}catch{}if(page)break;await delay(100);}assert.ok(page,'Installed app missing');
const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();socket.addEventListener('message',({data})=>{const msg=JSON.parse(data),callback=pending.get(msg.id);if(callback){pending.delete(msg.id);msg.error?callback.reject(Error('Native command failed')):callback.resolve(msg.result);}});
const evaluate=expression=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve:r=>r.exceptionDetails?reject(Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text)):resolve(r.result.value),reject});socket.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});
const invoke=(command,args={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
const dataDirectory=join(process.env.APPDATA,'com.focusmatrix.desktop');
const readContent=async()=>{const data=JSON.parse(await readFile(join(dataDirectory,'focus-matrix.json'),'utf8'));return {tasks:data.tasks,dailyMemos:data.dailyMemos??{}};};
const origin='https://focus-matrix-plans-17154.just-bard-2476.chatgpt.site';
const request=async(path,token,body,method=body?'POST':'GET')=>{const response=await fetch(origin+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});return {status:response.status,body:await response.json()};};
let deviceId;
try{
 let status;for(let i=0;i<80;i++){status=await invoke('get_cloud_status');if(status.configured&&status.lastSyncedAt&&!status.error&&!status.delivery)break;await delay(500);}assert.ok(status.configured&&status.lastSyncedAt&&!status.error&&!status.delivery,status.error??'Sync not ready');assert.ok(status.enabled&&status.editingEnabled);
 const token=new URL(status.shareUrl).hash.slice(1),plan=await request('/api/plan',token);assert.equal(plan.status,200);assert.equal(plan.body.editable,true);assert.ok(isDeepStrictEqual(plan.body.content,await readContent()),'Cloud and local content differ');assert.equal((await request('/api/plan')).status,404);
 assert.equal((await request('/api/devices/pair',token,undefined,'POST')).status,401);
 assert.equal((await request('/api/devices/self',token,undefined,'DELETE')).status,401);
 const paired=await invoke('create_mobile_pairing'),code=new URLSearchParams(new URL(paired.pairingUrl).hash.slice(1)).get('pair');
 const claim=await request('/api/devices/claim',code,{label:'发布检查（临时）'});assert.equal(claim.status,200);deviceId=claim.body.deviceId;const deviceToken=claim.body.deviceToken;
 const mobile=await request('/api/sync',deviceToken);assert.equal(mobile.status,200);assert.ok(isDeepStrictEqual(mobile.body.snapshot.content,await readContent()),'Phone and desktop content differ');assert.equal((await request('/api/devices',deviceToken)).status,401);
 const unchanged=await request('/api/sync',deviceToken,{base:mobile.body.snapshot.content,content:mobile.body.snapshot.content,clientId:crypto.randomUUID(),requestId:crypto.randomUUID(),actor:'发布检查'});assert.equal(unchanged.status,200);assert.equal(unchanged.body.snapshot.revision,mobile.body.snapshot.revision);
 assert.equal((await request('/api/devices/self',deviceToken,undefined,'DELETE')).status,200);assert.equal((await request('/api/sync',deviceToken)).status,401);
 await invoke('revoke_mobile_device',{id:deviceId});deviceId=null;
 const apk=await fetch(origin+'/downloads/FocusMatrix-Android.apk',{signal:AbortSignal.timeout(20000)});assert.equal(apk.status,200);const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),bytes=Buffer.from(await apk.arrayBuffer());assert.equal(digest(bytes),digest(await readFile('outputs/FocusMatrix-Android.apk')));
 await writeFile('outputs/mobile-release-check.json',JSON.stringify({verified:true,shareUrl:status.shareUrl,taskCount:(await readContent()).tasks.length,apkBytes:bytes.length,apkSha256:digest(bytes)},null,2));
 console.log('线上安装版：本地/云端/手机内容一致，可编辑分享生效，配对与撤销、管理权限及 APK 下载哈希均通过。');
}finally{if(deviceId)await invoke('revoke_mobile_device',{id:deviceId}).catch(()=>undefined);socket.close();}
