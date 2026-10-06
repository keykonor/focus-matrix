import {useCallback,useEffect,useRef,useState} from 'react';
import {contentSchema} from '../../lib/plans';
import {same,mergeContent,type SyncContent,type SyncSnapshot} from '../../lib/syncModel';
import {readMobileState,writeMobileState,type MobileState,type MobileRequest} from './mobileStore';
interface Options {mode:'mobile'|'share';token:string|null;}
function parseSnapshot(value:unknown):SyncSnapshot {if(!value||typeof value!=='object')throw Error('云端响应无效');const result=value as SyncSnapshot;contentSchema.parse(result.content);if(!Number.isSafeInteger(result.revision)||typeof result.updatedAt!=='number'||typeof result.marks!=='object')throw Error('云端响应无效');return result;}
export function useMobileSync({mode,token}:Options){
 const key=mode==='share'?`share:${token??'missing'}`:'owner';const [state,setState]=useState<MobileState|null>(null),[message,setMessage]=useState('正在读取本地内容…'),[busy,setBusy]=useState(false),[storageError,setStorageError]=useState(false);
 const [editable,setEditable]=useState(mode==='mobile');
 const current=useRef<MobileState|null>(null),queue=useRef<Promise<void>>(Promise.resolve()),working=useRef(false),active=useRef(true),schedule=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const save=useCallback((next:MobileState,reason:string)=>{const previous=current.current;current.current=next;setState(next);const operation=queue.current.catch(()=>undefined).then(()=>writeMobileState(key,next,previous&&!same(previous.content,next.content)?previous.content:null,reason));queue.current=operation;void operation.then(()=>setStorageError(false)).catch(error=>{setStorageError(true);setMessage(String(error));});return operation;},[key]);
 const sync=useCallback(async()=>{if(working.current||!current.current||document.hidden)return;working.current=true;setBusy(true);
  try{await queue.current;let local=current.current;
   if(!local)return;
   if(local.auth.mode==='share'){
    const response=await fetch('/api/plan',{headers:{Authorization:`Bearer ${local.auth.token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('分享链接已失效或已关闭，手机里的内容仍保留');const view=await response.json() as SyncSnapshot & {editable:boolean};
    setEditable(view.editable);
    if(!view.editable){if(local.editable!==false){local={...local,editable:false};await save(local,'权限关闭');}const snapshot=parseSnapshot(view);if(!local.pending&&same(local.content,local.base))await save({...local,...snapshot,base:snapshot.content},'读取只读分享');setMessage('编辑权限已关闭；未同步的本地内容仍保留，可导出备份');return;}
   }
   let request:MobileRequest|null=local.pending;let response:Response;
   // The base is stored separately from the draft so offline edits cannot replace other devices.
   const base=local.base;
   if(request||!same(local.content,base)){
    request??={base,content:structuredClone(local.content),clientId:local.auth.clientId,requestId:crypto.randomUUID(),actor:local.auth.label};
    if(!local.pending){local={...local,pending:request};await save(local,'准备同步');}
    response=await fetch('/api/sync',{method:'POST',headers:{Authorization:`Bearer ${local.auth.token}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(15000)});
   }else response=await fetch('/api/sync',{headers:{Authorization:`Bearer ${local.auth.token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error(response.status===401?'编辑权限已撤销，本地内容仍保留':'云端暂不可用，本地已保存，稍后自动重试');
   const body=await response.json() as {snapshot:unknown;conflicts?:number},snapshot=parseSnapshot(body.snapshot),latest=current.current!;
   const merged=mergeContent(request?.content??base,latest.content,snapshot.content);
   const next={...latest,...snapshot,content:merged.content,base:snapshot.content,pending:null,editable:true};
   if(!same(next,latest))await save(next,'云端同步');
   setMessage(body.conflicts||merged.conflictIds.length?'同时修改已保留两份内容，请查看修改记录':same(merged.content,snapshot.content)?'已与电脑和云端同步':'本地已保存，等待下一次同步');
  }catch(error){setMessage(navigator.onLine?String(error):'离线：内容已保存到手机，联网后自动同步');}
  finally{working.current=false;if(active.current)setBusy(false);}
 },[save]);
 useEffect(()=>{active.current=true;let disposed=false;void readMobileState(key).then(async saved=>{if(disposed)return;
  if(saved){current.current=saved;setState(saved);setEditable(saved.auth.mode==="mobile"||saved.editable===true);setMessage('本地内容已恢复');return;}
  if(mode==='share'&&token){const response=await fetch('/api/plan',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('分享链接无效或已关闭');const view=await response.json() as SyncSnapshot & {editable:boolean};const snapshot=parseSnapshot(view);if(disposed)return;setEditable(view.editable);await save({...snapshot,editable:view.editable,base:snapshot.content,auth:{token,clientId:crypto.randomUUID(),mode,label:'分享访客'},pending:null},'首次连接');}
  else setMessage('请在电脑的“分享”中生成手机配对链接');
 }).catch(error=>{if(!disposed)setMessage(String(error));});return()=>{disposed=true;active.current=false;clearTimeout(schedule.current);};},[key,mode,token,save]);
 useEffect(()=>{const run=()=>{if(current.current&&!document.hidden)void sync();};const timer=setInterval(run,10000),initial=setTimeout(run,1000);window.addEventListener('online',run);document.addEventListener('visibilitychange',run);return()=>{clearInterval(timer);clearTimeout(initial);window.removeEventListener('online',run);document.removeEventListener('visibilitychange',run);};},[sync]);
 const change=useCallback((content:SyncContent,reason='手机编辑')=>{const previous=current.current;if(!previous)return;void save({...previous,content},reason);setMessage('本地已保存，正在等待同步');clearTimeout(schedule.current);schedule.current=setTimeout(()=>void sync(),800);},[save,sync]);
 const claim=useCallback(async(pairCode:string,label:string)=>{setBusy(true);try{const response=await fetch('/api/devices/claim',{method:'POST',headers:{Authorization:`Bearer ${pairCode}`,'Content-Type':'application/json'},body:JSON.stringify({label}),signal:AbortSignal.timeout(15000)});const body=await response.json() as {error?:string;deviceToken:string;snapshot:unknown};if(!response.ok)throw Error(body.error??'手机配对失败');const snapshot=parseSnapshot(body.snapshot);await save({...snapshot,base:snapshot.content,auth:{token:body.deviceToken,clientId:crypto.randomUUID(),mode:'mobile',label},pending:null},'手机配对');setMessage('手机已配对，内容自动同步');return true;}catch(error){setMessage(String(error));return false;}finally{setBusy(false);}},[save]);
 const rename=useCallback((label:string)=>{if(current.current)void save({...current.current,auth:{...current.current.auth,label}},'编辑署名');},[save]);
 return {state,message,busy,storageError,editable,key,change,sync,claim,rename};
}

