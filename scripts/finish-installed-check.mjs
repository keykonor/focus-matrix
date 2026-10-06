import {setTimeout as delay} from 'node:timers/promises';
const pages=await(await fetch('http://127.0.0.1:9236/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://tauri.localhost'));
if(!page)throw Error('Installed WebView missing');
const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
const response=new Promise((resolve,reject)=>{socket.addEventListener('message',({data})=>{const message=JSON.parse(data);if(message.id===1){if(message.result?.exceptionDetails||message.error)reject(Error('Could not request a safe application exit'));else resolve();}});});
socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:"window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'focus-matrix://quit-requested',payload:null})",awaitPromise:true,returnByValue:true}}));
await response;socket.close();await delay(1200);console.log('已请求保存后退出临时调试实例。');
