import config from './publicCloudConfig.json';
// Retain the old origin while ensuring upgraded and legacy clients share one DB.
export async function publicCloudRequest(request:Request,legacy:(request:Request)=>Promise<Response>):Promise<Response>{
 if(config.apiOrigin===config.legacyOrigin)return legacy(request);
 const source=new URL(request.url),headers=new Headers();
 const authorization=request.headers.get('Authorization');
 if(authorization)headers.set('Authorization',authorization);
 let body:string|undefined;
 if(request.method!=='GET'&&request.method!=='HEAD'){
  body=await request.text();
  if(new TextEncoder().encode(body).length>5_000_000)return Response.json({error:'内容过大'},{status:413});
  if(body)headers.set('Content-Type','application/json');
 }
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
 try{
  const result=await fetch(config.apiOrigin+source.pathname+source.search,{method:request.method,headers,body,signal:controller.signal,redirect:'manual'});
  if(!result.headers.get('Content-Type')?.includes('application/json'))return Response.json({error:'云端暂不可用，本地内容保留'},{status:503});
  return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch{return Response.json({error:'云端暂不可用，本地内容保留，请稍后重试'},{status:503});}
 finally{clearTimeout(timer);}
}
