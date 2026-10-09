import {useCallback,useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {SyncContent,SyncSnapshot} from '../../cloud-site/lib/syncModel';
export interface CloudDelivery {requestId:string;sentContent:SyncContent;snapshot:SyncSnapshot;conflicts:number;}
export interface MobileDevice {id:string;label:string;revoked:number;}
export interface PairingLink {pairingUrl:string;expiresAt:number;}
export interface PhoneConnection {pairing:PairingLink|null;devices:MobileDevice[];checkedAt:number|null;}
export interface CloudStatus {configured:boolean;enabled:boolean;editingEnabled:boolean;shareUrl:string|null;lastSyncedAt:number|null;error:string|null;delivery?:CloudDelivery|null;phoneConnection?:PhoneConnection;configurationState?:'loading'|'ready'|'error'|'preview';connectionState?:'checking'|'connected'|'error';}
const empty:CloudStatus={configured:false,enabled:false,editingEnabled:true,shareUrl:null,lastSyncedAt:null,error:null,configurationState:'loading',connectionState:'checking'};
interface Controller{flush:()=>Promise<boolean>;read:()=>SyncContent;apply:(delivery:CloudDelivery)=>Promise<void>;}
export function useCloudSharing(ready:boolean,controller:Controller){
 const [status,setStatus]=useState<CloudStatus>(empty),[busy,setBusy]=useState(false);const operation=useRef(false),loaded=useRef(false),callbacks=useRef(controller);callbacks.current=controller;
 const run=useCallback(async(command:string,args:Record<string,unknown>={})=>{if(operation.current)return;operation.current=true;setBusy(true);
  let configurationLoaded=false;
  try{
   if(!(window as Window & {__TAURI_INTERNALS__?:{invoke?:unknown}}).__TAURI_INTERNALS__?.invoke){setStatus({...empty,configurationState:'preview'});return;}
   // Read credentials independently of saving/syncing, so a local save failure
   // cannot prevent a failed startup read from being retried.
   if(!loaded.current||command==='get_cloud_status'){
    const current=await invoke<CloudStatus>('get_cloud_status');loaded.current=current.configured;configurationLoaded=true;
    setStatus({...current,configurationState:'ready',connectionState:current.error?'error':'checking'});
    if(command==='get_cloud_status'||!current.configured)return;
   }
   let next:CloudStatus;if(command==='sync_cloud'){if(!await callbacks.current.flush())throw Error('本地保存失败，同步已暂停');next=await invoke<CloudStatus>(command,{content:callbacks.current.read()});}else next=await invoke<CloudStatus>(command,args);
   // Publish restored config/bindings even if applying a delivery later fails.
   setStatus({...next,configurationState:'ready',connectionState:next.error?'error':'checking'});
   if(next.delivery){await callbacks.current.apply(next.delivery);next=await invoke<CloudStatus>('ack_cloud_applied',{requestId:next.delivery.requestId,revision:next.delivery.snapshot.revision});}
   setStatus({...next,configurationState:'ready',connectionState:next.error?'error':command==='sync_cloud'?'connected':'checking'});
  }catch(error){setStatus(current=>({...current,configurationState:loaded.current||configurationLoaded?'ready':'error',connectionState:'error',error:String(error)}));}finally{operation.current=false;setBusy(false);}
 },[]);
 useEffect(()=>{if(!ready)return;let timer:ReturnType<typeof setTimeout>|undefined;let active=true;
  const queue=()=>{if(!active||operation.current)return;clearTimeout(timer);timer=setTimeout(()=>void run('sync_cloud'),1200);};void run('get_cloud_status').then(queue);const interval=setInterval(()=>void run('sync_cloud'),10000);
  window.addEventListener('focus-matrix:content-saved',queue);window.addEventListener('online',queue);
  return()=>{active=false;clearTimeout(timer);clearInterval(interval);window.removeEventListener('focus-matrix:content-saved',queue);window.removeEventListener('online',queue);};
 },[ready,run]);
 return {status,busy,sync:()=>run('sync_cloud'),toggle:(enabled:boolean)=>run('set_cloud_sharing',{enabled}),editing:(enabled:boolean)=>run('set_share_editing',{enabled}),rotate:()=>run('rotate_cloud_link')};
}
