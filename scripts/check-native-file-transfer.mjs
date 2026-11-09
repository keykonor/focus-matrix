// Builds a separate product/identifier/mutex/startup identity. Never launches
// canonical FocusMatrix or relies on APPDATA redirection for isolation.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'node:net';
const reuse=process.env.MATRIX_TRANSFER_CHECK_REUSE;
assert.ok(!reuse || /^native-transfer-\d+$/.test(reuse),'Reuse must name an isolated output directory');
const root=process.cwd(),stamp=reuse?.slice('native-transfer-'.length)||Date.now().toString(),title=`Matrix Transfer Check ${stamp}`;
const identifier=`com.focusmatrix.transfercheck${stamp}`,work=resolve('outputs',`native-transfer-${stamp}`),crate=join(work,'src-tauri');
const cargo=join(root,'.cargo','bin','cargo.exe');
async function command(exe,args,options={}) {
 return await new Promise((res,rej)=>{const child=spawn(exe,args,{cwd:root,stdio:'inherit',...options});child.on('error',rej);child.on('exit',code=>code===0?res():rej(Error(`${exe} exited ${code}`)));});
}
if(!reuse){
await mkdir(crate,{recursive:true});
await cp('LICENSE',join(work,'LICENSE'));
await cp('THIRD_PARTY_NOTICES.md',join(work,'THIRD_PARTY_NOTICES.md'));
await cp('licenses',join(work,'licenses'),{recursive:true});
for(const name of ['src','capabilities','icons','windows','build.rs','Cargo.toml','Cargo.lock'])await cp(join(root,'src-tauri',name),join(crate,name),{recursive:true});
await mkdir(join(work,'cloud-site','lib'),{recursive:true});
await cp('cloud-site/lib/publicCloudConfig.json',join(work,'cloud-site','lib','publicCloudConfig.json'));
let lib=await readFile(join(crate,'src','lib.rs'),'utf8');
lib=lib.replace('FocusMatrix_com_focusmatrix_desktop',`FocusMatrix_transfercheck_${stamp}`).replaceAll('"Focus Matrix\\0"',`"${title}\\0"`);
assert.ok(!lib.includes('FocusMatrix_com_focusmatrix_desktop'));
await writeFile(join(crate,'src','lib.rs'),lib);
const manifest=(await readFile(join(crate,'Cargo.toml'),'utf8')).replace('name = "focus-matrix"','name = "matrix-transfer-check"');
await writeFile(join(crate,'Cargo.toml'),manifest);
const config=JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8'));
config.identifier=identifier;config.productName=title;config.app.windows[0].title=title;config.app.windows[0].width=1000;config.app.windows[0].height=700;
// A Windows C:\\ absolute string parses as a URL in Tauri's untagged enum.
config.build.frontendDist='../../../dist';delete config.build.devUrl;delete config.build.beforeBuildCommand;delete config.build.beforeDevCommand;config.bundle.active=false;
await writeFile(join(crate,'tauri.conf.json'),JSON.stringify(config));
}else{
 const config=JSON.parse(await readFile(join(crate,'tauri.conf.json'),'utf8'));
 assert.equal(config.identifier,identifier);assert.equal(config.productName,title);
 assert.ok(!(await readFile(join(crate,'src','lib.rs'),'utf8')).includes('FocusMatrix_com_focusmatrix_desktop'));
}
const dataRoot=join(process.env.APPDATA,identifier);await mkdir(dataRoot,{recursive:true});
const now=new Date().toISOString(),day=new Intl.DateTimeFormat('en-CA').format(new Date());
const seed={tasks:[{id:'native-parent',text:'隔离文件接收测试',completed:false,quadrant:'important-urgent',createdAt:now,updatedAt:now}],dailyMemos:{},dailyDiaries:{},completedTasks:[],taskDay:day,settings:{autostart:false,desktopMode:false,opacity:100,fontSize:'medium',showCompleted:true,calendarOpen:false,closeBehavior:'quit'}};
await writeFile(join(dataRoot,'focus-matrix.json'),JSON.stringify(seed));
const env={...process.env,CARGO_HOME:join(root,'.cargo'),RUSTUP_HOME:join(root,'.rustup')};
if(!reuse || process.env.MATRIX_TRANSFER_CHECK_REBUILD)await command(cargo,['build','--manifest-path',join(crate,'Cargo.toml'),'--target-dir',join(root,'src-tauri','target'),'--features','tauri/custom-protocol'],{env});
const portServer=createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
const app=spawn(join(root,'src-tauri','target','debug','matrix-transfer-check.exe'),[],{env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`},stdio:'inherit'});
let socket,serial=0;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
async function wait(expression){for(let n=0;n<120;n++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}throw Error(`Timeout ${expression}; isolated page: ${await evaluate('document.body.innerText')}`);}
const nativeInput=async(selector,mode,files=[],text='',source={})=>{
 const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 const request=join(work,'input.json');await writeFile(request,JSON.stringify({title,...point,mode,files,text,...source}));
 await command('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',join(root,'scripts','native-transfer-input.ps1'),'-Request',request]);
};
try {
 let page;for(let n=0;n<150;n++){try {page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page');}catch{}if(page)break;await delay(100);}
 assert.ok(page,'Isolated WebView did not start');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 socket.addEventListener('message',({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 await wait("document.querySelector('.task-text')?.value==='隔离文件接收测试' && !document.querySelector('.calendar-button').disabled");
 await evaluate(`window.nativeTransferEvents=[];for(const event of ['focus-matrix://files-dropped','tauri://drag-drop'])window.__TAURI_INTERNALS__.invoke('plugin:event|listen',{event,target:{kind:'Any'},handler:window.__TAURI_INTERNALS__.transformCallback(e=>window.nativeTransferEvents.push(e))});true`);
 await writeFile(join(work,'拖入测试.txt'),'synthetic native OLE file');await writeFile(join(work,'复制测试.csv'),'name,value\nsynthetic,1');
 const row='.task-item[data-task-id="native-parent"]';
 await nativeInput(row+' .task-text','drop',[join(work,'拖入测试.txt')]);
 console.log('native events',await evaluate('window.nativeTransferEvents'));
 await wait("[...document.querySelectorAll('.document-open')].some(e=>e.textContent==='拖入测试.txt')");
 console.log('actual Windows OLE file drop to existing task: OK');
 await evaluate("document.querySelector('.task-text').focus()");
 await nativeInput(row+' .task-text','paste',[join(work,'复制测试.csv')]);
 await wait("[...document.querySelectorAll('.document-open')].some(e=>e.textContent==='复制测试.csv')");
 console.log('actual Windows CF_HDROP copy/paste: OK');
 await nativeInput('.quadrant-not-important-not-urgent .quadrant-heading','drop',[join(work,'复制测试.csv'),join(work,'拖入测试.txt')]);
 await wait("document.querySelectorAll('.quadrant-not-important-not-urgent .document-open').length===2");
 console.log('actual multi-file drop to empty quadrant creates task: OK');
 await evaluate("document.querySelector('.quadrant-important-not-urgent .add-task').click()");
 const source='.quadrant-important-not-urgent .task-text';await wait(`document.querySelector('${source}')`);
 await evaluate(`(()=>{const e=document.querySelector('${source}');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'https://example.com/matrix-native-check');e.dispatchEvent(new Event('input',{bubbles:true}));e.focus();e.select();})()`);
 const sourcePoint=await evaluate(`(()=>{const r=document.querySelector('${source}').getBoundingClientRect();return {sourceX:r.x+15,sourceY:r.y+12};})()`);
 await nativeInput(row+' .task-text','text',[],'',sourcePoint);
 await wait("[...document.querySelectorAll('.task-text')].some(e=>e.value.includes('https://example.com/matrix-native-check')) && !document.querySelector('.task-link')");
 assert.ok((await evaluate('window.nativeTransferEvents')).some(e=>e.payload.text?.includes('https://example.com/matrix-native-check')),'Text did not pass through native OLE target');
 await evaluate("document.querySelector('.quadrant-important-not-urgent .delete-button').click()");
 console.log('actual Unicode URL OLE drop: OK');
 await evaluate("document.querySelector('.save-version-button').click()");await delay(700);
 const saved=JSON.parse(await readFile(join(dataRoot,'focus-matrix.json'),'utf8'));assert.equal(saved.tasks.length,2);
 assert.ok(saved.tasks[0].text.includes('https://example.com/matrix-native-check'));
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(work,'native-transfer.png'),Buffer.from(shot.data,'base64'));
 // Request normal save/quit in this isolated app only.
 console.log(JSON.stringify({isolatedIdentifier:identifier,work,dataRoot,tasks:saved.tasks.length,deviceScale:await evaluate('devicePixelRatio')}));
} finally {
 if(socket?.readyState===WebSocket.OPEN && app.exitCode===null){try{await evaluate("setTimeout(()=>window.__TAURI_INTERNALS__.invoke('quit_app'),0);true");}catch{}}
 socket?.close();
}
