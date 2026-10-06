import {useCallback,useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {SyncContent,SyncSnapshot} from '../../cloud-site/lib/syncModel';
export interface CloudDelivery {requestId:string;sentContent:SyncContent;snapshot:SyncSnapshot;conflicts:number;}
export interface MobileDevice {id:string;label:string;revoked:number;}
export interface PairingLink {pairingUrl:string;expiresAt:number;}
export interface PhoneConnection {pairing:PairingLink|null;devices:MobileDevice[];checkedAt:number|null;}
export interface CloudStatus {configured:boolean;enabled:boolean;editingEnabled:boolean;shareUrl:string|null;lastSyncedAt:number|null;error:string|null;delivery?:CloudDelivery|null;phoneConnection?:PhoneConnection;}
const empty:CloudStatus={configured:false,enabled:false,editingEnabled:true,shareUrl:null,lastSyncedAt:null,error:null};
interface Controller{flush:()=>Promise<boolean>;read:()=>SyncContent;apply:(delivery:CloudDelivery)=>Promise<void>;}
export function useCloudSharing(ready:boolean,controller:Controller){
 const [status,setStatus]=useState<CloudStatus>(empty),[busy,setBusy]=useState(false);const operation=useRef(false),callbacks=useRef(controller);callbacks.current=controller;
 const run=useCallback(async(command:string,args:Record<string,unknown>={})=>{if(operation.current)return;operation.current=true;setBusy(true);
  try{let next:CloudStatus;if(command==='sync_cloud'){if(!await callbacks.current.flush())throw Error('本地保存失败，同步已暂停');next=await invoke<CloudStatus>(command,{content:callbacks.current.read()});}else next=await invoke<CloudStatus>(command,args);
   if(next.delivery){await callbacks.current.apply(next.delivery);next=await invoke<CloudStatus>('ack_cloud_applied',{requestId:next.delivery.requestId,revision:next.delivery.snapshot.revision});}setStatus(next);
  }catch(error){setStatus(current=>({...current,error:String(error)}));}finally{operation.current=false;setBusy(false);}
 },[]);
 useEffect(()=>{if(!ready)return;let timer:ReturnType<typeof setTimeout>|undefined;void run('get_cloud_status');
  const queue=()=>{if(operation.current)return;clearTimeout(timer);timer=setTimeout(()=>void run('sync_cloud'),1200);};queue();const interval=setInterval(()=>void run('sync_cloud'),10000);
  window.addEventListener('focus-matrix:content-saved',queue);window.addEventListener('online',queue);
  return()=>{clearTimeout(timer);clearInterval(interval);window.removeEventListener('focus-matrix:content-saved',queue);window.removeEventListener('online',queue);};
 },[ready,run]);
 return {status,busy,sync:()=>run('sync_cloud'),toggle:(enabled:boolean)=>run('set_cloud_sharing',{enabled}),editing:(enabled:boolean)=>run('set_share_editing',{enabled}),rotate:()=>run('rotate_cloud_link')};
}
