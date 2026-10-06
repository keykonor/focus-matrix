const upstream='https://focus-matrix-plans-17154.just-bard-2476.chatgpt.site';
const routes=new Map([
 ['/api/plan',['GET','PUT','DELETE']],['/api/sync',['GET','POST']],['/api/changes',['GET']],
 ['/api/devices',['GET','DELETE']],['/api/devices/pair',['POST']],['/api/devices/claim',['POST']],['/api/devices/self',['DELETE']],
]);
const legacyOrigins=new Set([upstream,'http://tauri.localhost','https://tauri.localhost']);
const maxBody=5_000_000;

export function createGateway(fetcher=fetch){return async function handle(request){
 const url=new URL(request.url),origin=request.headers.get('Origin'),headers={
  'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',
  'Vary':'Origin',
 };
 if(origin&&(origin===url.origin||legacyOrigins.has(origin))){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='GET, POST, PUT, DELETE, OPTIONS';headers['Access-Control-Allow-Headers']='Authorization, Content-Type';}
 const reply=(body,status=200)=>Response.json(body,{status,headers});
 if(origin&&!headers['Access-Control-Allow-Origin'])return reply({error:'不允许的来源'},403);
 const health=url.pathname==='/api/health';
 if(!health&&!routes.has(url.pathname))return reply({error:'接口不存在'},404);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(health&&request.method!=='GET'||!health&&!routes.get(url.pathname).includes(request.method))return reply({error:'不允许的请求方法'},405);
 if(!health&&!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('Authorization')??''))return reply({error:'缺少连接凭据'},url.pathname==='/api/plan'&&request.method==='GET'?404:401);
 if(url.search&&(url.pathname!=='/api/changes'||!/^[?]before=\d+$/.test(url.search)))return reply({error:'无效查询参数'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
 try{
  let body;
  if(request.method==='POST'||request.method==='PUT'||request.method==='DELETE'){
   if(Number(request.headers.get('Content-Length'))>maxBody)return reply({error:'内容过大'},413);
   const bytes=await request.arrayBuffer();if(bytes.byteLength>maxBody)return reply({error:'内容过大'},413);if(bytes.byteLength)body=bytes;
  }
  const forwarded={'Accept':'application/json'};
  if(!health)forwarded.Authorization=request.headers.get('Authorization');
  if(body)forwarded['Content-Type']='application/json';
  const response=await fetcher(upstream+(health?'/api/plan':url.pathname+url.search),{method:health?'GET':request.method,headers:forwarded,body,redirect:'manual',signal:controller.signal});
  if(!response.headers.get('Content-Type')?.includes('application/json'))return reply({error:'云端托管入口拒绝连接，本地内容保留。请稍后重试或联系维护者。',code:'UPSTREAM_BLOCKED',upstreamStatus:response.status},503);
  if(health)return reply({service:'focus-matrix-gateway',protocol:1,upstreamReachable:response.status===404},response.status===404?200:503);
  const value=await response.json();
  // Links are issued by the existing database; only replace the public entry address.
  if(url.pathname==='/api/devices/pair'&&response.ok&&typeof value.pairingUrl==='string'){
   const pair=new URL(value.pairingUrl);if(pair.origin!==upstream||!/^#pair=[a-f0-9]{64}$/.test(pair.hash))return reply({error:'云端配对响应无效'},502);
   value.pairingUrl=url.origin+pair.pathname+pair.hash;
  }
  return reply(value,response.status);
 }catch{return reply({error:'云端连接暂不可用，本地内容保留，恢复网络后重试。',code:'UPSTREAM_UNAVAILABLE'},503);}
 finally{clearTimeout(timer);}
};}
