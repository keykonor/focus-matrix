// Isolated browser harness: no real user files, credentials, or network requests.
import React from 'react';
import ReactDOM from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import {useCloudSharing} from '../src/hooks/useCloudSharing';
import {CloudShareModal} from '../src/components/CloudShareModal';
import '../src/styles.css';

const scenario=new URLSearchParams(location.search).get('scenario');
const counters={reads:0,syncs:0,flushes:0};
const content={tasks:[],dailyMemos:{}};
const status={configured:true,enabled:false,editingEnabled:true,shareUrl:null,lastSyncedAt:123,error:null,
 phoneConnection:{pairing:{pairingUrl:'https://example.invalid/#pair=expired',expiresAt:1},devices:[{id:'original-phone',label:'原手机',revoked:0}],checkedAt:123}};
if(scenario!=='preview')mockIPC(async(command)=>{
 if(command==='get_cloud_status'){
  counters.reads++;
  if(scenario==='delay')await new Promise(resolve=>setTimeout(resolve,2500));
  if(scenario==='read-error'||(scenario==='retry'&&counters.reads===1))throw Error('Windows 无法读取或加密分享凭据');
  return scenario==='missing'?{...status,configured:false,phoneConnection:undefined}:status;
 }
 if(command==='sync_cloud'){
  counters.syncs++;
  if(scenario==='offline')return {...status,error:'连接云端超时，请检查网络或系统代理'};
  if(scenario==='apply-error')return {...status,delivery:{requestId:'test',sentContent:content,snapshot:{content,revision:1,updatedAt:123,marks:{}},conflicts:0}};
  return status;
 }
 if(command==='list_mobile_devices')return {devices:status.phoneConnection.devices,cached:scenario==='offline',error:scenario==='offline'?'连接云端超时':undefined};
 throw Error('Unexpected test command');
});
function Harness(){
 const cloud=useCloudSharing(true,{flush:async()=>{counters.flushes++;if(scenario==='retry'&&counters.reads<2)throw Error('Save called before config retry');return true;},read:()=>content,apply:async()=>{throw Error('历史保存失败，同步尚未确认');}});
 return <><output id="test-state">{JSON.stringify({...counters,status:cloud.status})}</output><CloudShareModal initialSection="phone" {...cloud} onClose={()=>{}} onSync={cloud.sync} onToggle={cloud.toggle} onEditing={cloud.editing} onRotate={cloud.rotate}/></>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Harness/>);
