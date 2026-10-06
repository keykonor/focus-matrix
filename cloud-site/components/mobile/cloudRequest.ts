// AbortSignal.timeout is absent in older Android System WebView versions.
import {apiAddress} from './connectionLink';
export async function cloudRequest(path:string,options:RequestInit={}):Promise<Response>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{return await fetch(apiAddress(path),{...options,signal:controller.signal});}
 catch(error){
  if(controller.signal.aborted)throw Error('连接超时。请检查手机网络，保留链接后重试；配对链接超过 10 分钟需在电脑重新生成。');
  if(error instanceof TypeError)throw Error('无法访问公网云端，内容仍保留。手机和电脑不需要同一网络；恢复联网后重试。');
  throw error;
 }finally{clearTimeout(timer);}
}
export async function connectionResponse(response:Response):Promise<{deviceToken:string;snapshot:unknown}>{
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error(response.status===403?'云端托管入口拦截了当前网络（HTTP 403），请求未到达同步服务。与电脑是否启动、是否同一 Wi-Fi 无关；内容和绑定仍保留。':`云端托管入口返回异常（HTTP ${response.status}），内容仍保留，请稍后重试。`);
 const body:unknown=await response.json();
 if(!body||typeof body!=='object')throw Error('云端响应无效，请重新连接。');
 const data=body as {error?:unknown;deviceToken?:unknown;snapshot?:unknown};
 if(!response.ok)throw Error(typeof data.error==='string'?data.error:'手机配对失败，请在电脑重新生成配对链接。');
 if(typeof data.deviceToken!=='string'||!/^[a-f0-9]{64}$/.test(data.deviceToken))throw Error('配对凭据无效，请重新连接。');
 return {deviceToken:data.deviceToken,snapshot:data.snapshot};
}
