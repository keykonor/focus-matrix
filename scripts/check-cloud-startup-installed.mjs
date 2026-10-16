// Read-only acceptance checks for an installed WebView with temporary local CDP.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const directory=join(process.env.APPDATA,'com.focusmatrix.desktop');
const backup=process.argv[2];assert.ok(backup,'Provide the pre-install backup directory');
const page=(await(await fetch('http://127.0.0.1:9236/json/list')).json()).find(item=>item.type==='page'&&item.url.startsWith('http://tauri.localhost'));
assert.ok(page,'Installed WebView not found');
const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let id=0;const pending=new Map();
socket.addEventListener('message',({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}throw Error('Timed out: '+expression);};
const read=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
try{
 await wait(`document.querySelector('.phone-button')?.disabled===false`);
 const before=await evaluate(`window.__TAURI_INTERNALS__.invoke('get_cloud_status')`);assert.equal(before.configured,true);assert.equal('writerKey' in before,false);
 await evaluate(`document.querySelector('.modal-header button')?.click();document.querySelector('.phone-button').click()`);
 await wait(`document.querySelector('.phone-connection')`);await wait(`document.querySelector('.cloud-status')?.textContent.includes('云端连接正常')`);
 assert.equal(await evaluate(`document.querySelector('.cloud-modal').textContent.includes('云端尚未配置')`),false);
 await send('Page.reload');await wait(`document.querySelector('.phone-button')?.disabled===false`);
 const after=await evaluate(`window.__TAURI_INTERNALS__.invoke('get_cloud_status')`);assert.equal(after.configured,true);
 assert.deepEqual(after.phoneConnection.devices,before.phoneConnection.devices);assert.deepEqual(after.phoneConnection.pairing,before.phoneConnection.pairing);
 assert.equal(after.enabled,before.enabled);assert.equal(after.shareUrl,before.shareUrl);
 await evaluate(`document.querySelector('.phone-button').click()`);await wait(`document.querySelector('.cloud-status')?.textContent.includes('云端连接正常')`);
 await evaluate(`document.querySelector('.modal-header button').click();document.querySelector('[aria-label="打开历史记录"]').click()`);
 await wait(`document.querySelector('.history-modal')`);await evaluate(`document.querySelector('.history-close').click()`);
 assert.equal(await evaluate(`document.querySelectorAll('.quadrant').length`),4);
 const current=await read(join(directory,'focus-matrix.json')),prior=await read(join(backup,'focus-matrix.json'));
 for(const field of ['tasks','dailyMemos','settings'])assert.deepEqual(current[field],prior[field],field+' changed during install');
 assert.deepEqual(await read(join(directory,'.window-state.json')),await read(join(backup,'.window-state.json')));
 const versions=await readdir(join(backup,'history'));for(const name of versions)assert.deepEqual(await readFile(join(directory,'history',name)),await readFile(join(backup,'history',name)));
 console.log(JSON.stringify({verified:true,configuredAfterReload:true,connection:'normal',taskCount:current.tasks.length,memoDates:Object.keys(current.dailyMemos).length,preservedHistoryFiles:versions.length,deviceRecords:after.phoneConnection.devices.length,activeDevices:after.phoneConnection.devices.filter(d=>!d.revoked).length,settingsAndWindowPreserved:true}));
}finally{socket.close();}
