import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run',...(process.env.FOCUS_MATRIX_TEST_PROXY?[`--proxy-server=${process.env.FOCUS_MATRIX_TEST_PROXY}`]:[]),'--remote-debugging-port=9242',`--user-data-dir=${join(process.cwd(),'.edge-live-site-check')}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket;
try{
 let page;for(let i=0;i<80;i++){try{page=(await(await fetch('http://127.0.0.1:9242/json/list')).json())[0];}catch{}if(page)break;await delay(100);}
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();socket.addEventListener('message',({data})=>{const message=JSON.parse(data),callback=pending.get(message.id);if(callback){pending.delete(message.id);callback(message.result);}});
 const send=(method,params={})=>new Promise(r=>{const key=++id;pending.set(key,r);socket.send(JSON.stringify({id:key,method,params}));});
 await send('Page.navigate',{url:process.env.FOCUS_MATRIX_TEST_URL??'https://focus-matrix-plans-17154.just-bard-2476.chatgpt.site/'});
 let finalText='';for(let i=0;i<100;i++){const result=await send('Runtime.evaluate',{expression:'document.title+"\\n"+document.body.innerText.slice(0,1200)',returnByValue:true});finalText=result?.result?.value??'';if(finalText.includes('请使用电脑软件')||finalText.includes('Sorry, you have been blocked'))break;await delay(250);}
 if(process.env.FOCUS_MATRIX_TEST_URL){
  let count=0;for(let i=0;i<100;i++){const result=await send('Runtime.evaluate',{expression:"document.querySelectorAll('.mobile-quadrant').length",returnByValue:true});count=result?.result?.value??0;if(count===4)break;await delay(100);}assert.equal(count,4,'Shared matrix failed to load');
  const result=await send('Runtime.evaluate',{expression:"document.querySelectorAll('.mobile-task').length",returnByValue:true});assert.equal(result.result.value,Number(process.env.FOCUS_MATRIX_EXPECTED_TASKS??4));console.log('线上 Edge 完整分享链接显示四象限及全部当前任务：通过');
 }else{assert.ok(finalText.includes('请使用电脑软件'),'Live anonymous page failed to load');console.log('线上 Edge 匿名页面可访问，无查看链接不显示个人数据：通过');}
}finally{socket?.close();browser.kill();}
