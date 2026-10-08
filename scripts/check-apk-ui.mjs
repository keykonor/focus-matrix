// Use only files extracted from the signed APK; all non-asset requests fail.
// This checks packaged web content; it is not an Android device test.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'node:net';
const origin='https://focus-matrix-plans-17154.just-bard-2476.chatgpt.site';
const apiOrigin=JSON.parse(await readFile('cloud-site/lib/publicCloudConfig.json','utf8')).apiOrigin;
const directory=resolve('outputs/apk-ui-assets');
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--disable-extensions','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${join(process.cwd(),'.edge-apk-boot-check-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket,id=0;const pending=new Map(),errors=[],served=new Set();let blocked=0;
const at=new Date().toISOString(),content={tasks:[{id:'offline-boot-task',text:'安装包里的离线任务\n保留完整第二行',completed:false,quadrant:'important-urgent',createdAt:at,updatedAt:at}],dailyMemos:{}};
const snapshot={content,revision:2,updatedAt:Date.now(),marks:{}},pairToken='a'.repeat(64),shareToken='b'.repeat(64),deviceToken='f'.repeat(64);
let apiMode='offline';const requests=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.text);return response.result.value;};
const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}throw Error('APK startup timeout: '+JSON.stringify({errors,served:[...served],blocked})+'; '+await evaluate('location.href+\" | \"+document.body.innerText.slice(0,300)'));};
const intercept=async params=>{
 const uri=new URL(params.request.url),path=resolve(directory,'.'+decodeURIComponent(uri.pathname));
 if((uri.origin===origin||uri.origin===apiOrigin)&&uri.pathname.startsWith('/api/')&&apiMode!=='offline'){
  const cors=[{name:'Access-Control-Allow-Origin',value:origin},{name:'Access-Control-Allow-Headers',value:'Authorization, Content-Type'},{name:'Access-Control-Allow-Methods',value:'GET, POST, DELETE, OPTIONS'}];
  if(params.request.method==='OPTIONS'){await send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:204,responseHeaders:cors});return;}
  requests.push({path:uri.pathname,method:params.request.method,authorization:params.request.headers.Authorization??params.request.headers.authorization});
  const isClaim=uri.pathname==='/api/devices/claim';
  const status=isClaim&&apiMode==='expired'?401:isClaim&&apiMode==='html'?403:200;
  const body=status===401?{error:'配对链接已过期或已使用，请在电脑上重新生成'}:isClaim?{deviceToken,deviceId:'fixture-device',snapshot}:uri.pathname==='/api/devices/self'?{revoked:true}:uri.pathname==='/api/plan'?{...snapshot,editable:true}:{snapshot};
  await send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:status,responseHeaders:[...cors,{name:'Content-Type',value:apiMode==='html'?'text/html':'application/json'}],body:Buffer.from(apiMode==='html'?'<html>Unavailable</html>':JSON.stringify(body)).toString('base64')});return;
 }
 if(uri.origin!==origin||!uri.pathname.startsWith('/mobile/')||!path.startsWith(directory+sep)){blocked++;await send('Fetch.failRequest',{requestId:params.requestId,errorReason:'InternetDisconnected'});return;}
 try{const bytes=await readFile(path);served.add(uri.pathname);const mime=path.endsWith('.html')?'text/html; charset=utf-8':path.endsWith('.js')?'application/javascript':'text/css';await send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:mime},{name:'Cache-Control',value:'no-store'}],body:bytes.toString('base64')});}catch{await send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:404,body:''});}
};
try{
 let page;for(let i=0;i<100;i++){try{page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item=>item.type==='page'&&item.url==='about:blank');}catch{}if(page)break;await delay(100);}assert.ok(page);socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 socket.addEventListener('message',({data})=>{const msg=JSON.parse(data),callback=pending.get(msg.id);if(callback){pending.delete(msg.id);msg.error?callback.reject(Error(msg.error.message)):callback.resolve(msg.result);}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);if(msg.method==='Fetch.requestPaused')void intercept(msg.params).catch(error=>errors.push(error.message));});
 await send('Runtime.enable');await send('Page.enable');socket.addEventListener('message',({data})=>{const msg=JSON.parse(data);if(msg.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});});await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:origin+'/mobile/index.html'});
 await wait("document.querySelector('.pair-screen .primary')");assert.equal(await evaluate('location.origin'),origin);assert.ok(served.has('/mobile/index.html')&&served.size>=3);assert.equal(await evaluate("document.body.innerText.includes('ERR_HTTP_RESPONSE_CODE_FAILURE')"),false);
 console.log('Signed APK content opens the pairing screen with all network access blocked.');
 const typeLink=async value=>evaluate(`(()=>{const field=document.querySelector('[aria-label="手机配对链接"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await typeLink(origin+'/downloads/FocusMatrix-Android.apk');await wait("document.querySelector('.primary').disabled===false");await evaluate("document.querySelector('.primary').click()");await wait("document.querySelector('[role=alert]')?.textContent.includes('安装包')");
 await typeLink(origin+'/#'+shareToken);await wait("document.querySelector('.primary').textContent==='打开共享计划'");apiMode='ok';await evaluate("document.querySelector('.primary').click()");await wait("document.querySelector('.mobile-quadrant textarea')");assert.equal(requests.some(request=>request.path==='/api/devices/claim'),false);assert.ok(requests.some(request=>request.path==='/api/plan'&&request.authorization==='Bearer '+shareToken));
 await send('Storage.clearDataForOrigin',{origin,storageTypes:'indexeddb'});await send('Page.navigate',{url:origin+'/mobile/index.html'});await wait("document.querySelector('.pair-screen .primary')");
 await typeLink(origin+'/mobile/index.html#pair='+pairToken);await wait("document.querySelector('.primary').disabled===false");await evaluate('AbortSignal.timeout=undefined');
 apiMode='expired';await evaluate("document.querySelector('.primary').click()");await wait("document.querySelector('.mobile-status').textContent.includes('已过期')");
 apiMode='html';await evaluate("document.querySelector('.primary').click()");await wait("document.querySelector('.mobile-status').textContent.includes('HTTP 403')");
 apiMode='ok';await evaluate("document.querySelector('.primary').click()");await wait("document.querySelector('.mobile-quadrant textarea')");assert.ok(requests.some(request=>request.path==='/api/devices/claim'&&request.authorization==='Bearer '+pairToken));
 apiMode='offline';
 console.log('Packaged connection UI: download-link guidance, share-link permission, pairing click, expired-link retry, HTML error and old-WebView timeout compatibility passed.');
 const state={content,base:content,revision:0,updatedAt:Date.now(),marks:{},auth:{token:'f'.repeat(64),clientId:crypto.randomUUID(),mode:'mobile',label:'离线测试'},pending:null};
 await evaluate(`new Promise((resolve,reject)=>{const request=indexedDB.open('focus-matrix-mobile',1);request.onsuccess=()=>{const db=request.result,transaction=db.transaction('states','readwrite');transaction.objectStore('states').put(${JSON.stringify(state)},'owner');transaction.oncomplete=()=>{db.close();resolve(true)};transaction.onerror=()=>reject(Error('Storage failed'));};request.onerror=()=>reject(Error('Storage failed'));})`);
 await send('Page.reload');await wait("document.querySelector('[data-task-id=offline-boot-task] textarea')");assert.equal(await evaluate("document.querySelector('[data-task-id=offline-boot-task] textarea').value"),content.tasks[0].text);
 const changed='离线启动后仍可编辑\n'+('长文字完整换行 '.repeat(30));await evaluate(`(()=>{const field=document.querySelector('[data-task-id=offline-boot-task] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(changed)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(1300);
 await send('Page.reload');await wait(`document.querySelector('[data-task-id=offline-boot-task] textarea')?.value===${JSON.stringify(changed)}`);
 assert.equal(await evaluate("document.querySelector('[data-binding-state]').dataset.bindingState"),'bound');
 assert.ok(await evaluate("document.querySelector('.mobile-binding').textContent.includes('长期有效')"));
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));assert.ok(await evaluate("[...document.querySelectorAll('textarea')].every(field=>field.scrollHeight<=field.clientHeight+2)"));assert.deepEqual(errors,[]);
 await writeFile('outputs/apk-offline-startup.png',Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
 console.log('APK content: offline saved-data recovery, editing, restart, HTTPS storage origin and full text layout passed.');
 const stored=()=>evaluate(`new Promise((resolve,reject)=>{const request=indexedDB.open('focus-matrix-mobile',1);request.onsuccess=()=>{const db=request.result,transaction=db.transaction(['states','history'],'readonly');const state=transaction.objectStore('states').get('owner'),history=transaction.objectStore('history').index('key').getAll('owner');transaction.oncomplete=()=>{db.close();resolve({state:state.result,history:history.result})};transaction.onerror=()=>reject(Error('Storage failed'));}})`);
 const beforeCancel=await stored();assert.ok(beforeCancel.history.length>0);
 await wait("[...document.querySelectorAll('.mobile-binding button')].some(button=>!button.disabled)");
 await evaluate("document.querySelector('.mobile-binding button').click()");await wait("document.querySelector('[data-binding-state=disconnected]')");await delay(300);
 await send('Page.reload');await wait("document.querySelector('[data-binding-state=disconnected]')");
 const afterCancel=await stored();assert.equal(afterCancel.state.disconnectPending,true);assert.deepEqual(afterCancel.state.content,beforeCancel.state.content);assert.deepEqual(afterCancel.state.base,beforeCancel.state.base);assert.deepEqual(afterCancel.history,beforeCancel.history);
 const writesBefore=requests.filter(request=>request.path==='/api/sync'&&request.method==='POST').length;
 apiMode='ok';await evaluate("window.dispatchEvent(new Event('online'))");
 for(let i=0;i<100;i++){if(!(await stored()).state.disconnectPending)break;await delay(100);}
 assert.equal((await stored()).state.disconnectPending,false);assert.equal((await stored()).state.disconnected,true);
 assert.ok(requests.some(request=>request.path==='/api/devices/self'&&request.authorization==='Bearer '+deviceToken));assert.equal(requests.filter(request=>request.path==='/api/sync'&&request.method==='POST').length,writesBefore,'取消后不得上传任务');
 await typeLink(origin+'/mobile/index.html#pair='+pairToken);await wait("document.querySelector('.primary').disabled===false");await evaluate("document.querySelector('.primary').click()");await wait("document.querySelector('[data-binding-state=bound]')");
 assert.equal((await stored()).state.content.tasks.find(task=>task.id==='offline-boot-task').text,changed,'重新配对必须保留离线草稿');
 await send('Emulation.setDeviceMetricsOverride',{width:320,height:640,deviceScaleFactor:1,mobile:true});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
 assert.deepEqual(errors,[]);
 console.log('Persistent binding: offline restart, cancel while offline, retained drafts/history, retry self-revocation and reconnect without losing edits passed.');
}finally{if(socket?.readyState===WebSocket.OPEN)await send('Browser.close').catch(()=>undefined);socket?.close();browser.kill();}
