import {env} from 'cloudflare:workers';
import {equalToken,hashToken,contentSchema,syncRequestSchema} from './plans';
import {emptyContent,mergeContent,contentChanges,same,type SyncSnapshot,type EditMark} from './syncModel';
export const securityHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
export const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:securityHeaders});
export const bearer=(request:Request)=>request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]??'';
export function owner(request:Request){const secret=(env as Cloudflare.Env & {FOCUS_MATRIX_WRITE_TOKEN?:string}).FOCUS_MATRIX_WRITE_TOKEN;return !!secret&&equalToken(bearer(request),secret);}
export function database(){if(!env.DB)throw Error('Database unavailable');return env.DB;}
export interface Principal {id:string;source:EditMark['source'];label:string;}
export async function principal(request:Request):Promise<Principal|null>{
 if(owner(request))return {id:'desktop',source:'desktop',label:'电脑'};
 const token=bearer(request);if(!token)return null;const hashed=await hashToken(token),db=database();
 const device=await db.prepare('SELECT id,label FROM sync_devices WHERE token_hash=? AND revoked=0').bind(hashed).first<{id:string;label:string}>();
 if(device)return {id:device.id,source:'mobile',label:device.label};
 const share=await db.prepare('SELECT editable FROM shared_plans WHERE id=? AND view_token_hash=?').bind('main',hashed).first<{editable:number}>();
 return share?.editable?{id:`share-${hashed}`,source:'share',label:'分享访客'}:null;
}
export async function snapshot():Promise<SyncSnapshot>{
 const db=database();let row=await db.prepare('SELECT * FROM sync_state WHERE id=?').bind('main').first<{content:string;revision:number;updated_at:number;marks:string}>();
 if(!row){const existing=await db.prepare('SELECT content,updated_at FROM shared_plans WHERE id=?').bind('main').first<{content:string;updated_at:number}>();const content=existing?contentSchema.parse(JSON.parse(existing.content)):emptyContent();
  await db.batch([db.prepare('INSERT OR IGNORE INTO sync_state (id,content,revision,updated_at,marks,last_commit) VALUES (?,?,0,?,?,?)').bind('main',JSON.stringify(content),existing?.updated_at??Date.now(),'{}',''),db.prepare('INSERT OR IGNORE INTO sync_versions (revision,content,updated_at) SELECT revision,content,updated_at FROM sync_state WHERE id=?').bind('main')]);
  row=await db.prepare('SELECT * FROM sync_state WHERE id=?').bind('main').first();
 }
 if(!row)throw Error('Sync state unavailable');
 return {content:contentSchema.parse(JSON.parse(row.content)),revision:row.revision,updatedAt:row.updated_at,marks:JSON.parse(row.marks)};
}
export async function sync(request:Request){
 const auth=await principal(request);if(!auth)return reply({error:'编辑权限无效或已撤销'},401);
 const raw=await request.text();if(new TextEncoder().encode(raw).length>5_000_000)return reply({error:'内容过大'},413);
 let input:unknown;try{input=JSON.parse(raw);}catch{return reply({error:'无效数据'},400);}const parsed=syncRequestSchema.safeParse(input);if(!parsed.success)return reply({error:'同步格式无效'},400);
 const data=parsed.data,db=database(),receiptId=`${auth.id}:${data.clientId}`,commitId=`${receiptId}:${data.requestId}`;
 const receipt=await db.prepare('SELECT request_id FROM sync_receipts WHERE id=?').bind(receiptId).first<{request_id:string}>();
 if(receipt?.request_id===data.requestId)return reply({snapshot:await snapshot(),conflicts:0});
 for(let attempt=0;attempt<6;attempt++){
  const seen=await db.prepare('SELECT request_id FROM sync_receipts WHERE id=?').bind(receiptId).first<{request_id:string}>();
  if(seen?.request_id===data.requestId)return reply({snapshot:await snapshot(),conflicts:0});
  const before=await snapshot(),merged=mergeContent(data.base,data.content,before.content),now=Date.now();
  if(same(merged.content,before.content)){await db.prepare('INSERT INTO sync_receipts (id,request_id,revision) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET request_id=excluded.request_id,revision=excluded.revision').bind(receiptId,data.requestId,before.revision).run();return reply({snapshot:before,conflicts:0});}
  const actor=auth.source==='share'?data.actor:auth.label;const changes=contentChanges(before.content,merged.content,actor,auth.source,now,merged.conflictIds),marks={...before.marks};for(const change of changes)marks[change.entity]=change;
  const nextRevision=before.revision+1;
  const result=await db.batch([
   db.prepare('UPDATE sync_state SET content=?,revision=?,updated_at=?,marks=?,last_commit=? WHERE id=? AND revision=?').bind(JSON.stringify(merged.content),nextRevision,now,JSON.stringify(marks),commitId,'main',before.revision),
   db.prepare('INSERT OR IGNORE INTO sync_versions (revision,content,updated_at) SELECT revision,content,updated_at FROM sync_state WHERE id=? AND last_commit=?').bind('main',commitId),
   db.prepare('INSERT INTO sync_receipts (id,request_id,revision) SELECT ?,?,revision FROM sync_state WHERE id=? AND last_commit=? ON CONFLICT(id) DO UPDATE SET request_id=excluded.request_id,revision=excluded.revision').bind(receiptId,data.requestId,'main',commitId),
   db.prepare('INSERT OR IGNORE INTO sync_changes (id,revision,actor,source,at,changes) SELECT ?,revision,?,?,?,? FROM sync_state WHERE id=? AND last_commit=?').bind(commitId,actor,auth.source,now,JSON.stringify(changes),'main',commitId),
   db.prepare('UPDATE shared_plans SET content=(SELECT content FROM sync_state WHERE id=?),updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM sync_state WHERE id=? AND last_commit=?)').bind('main',now,'main','main',commitId),
  ]);
  if(result[0].meta.changes===1)return reply({snapshot:{content:merged.content,revision:nextRevision,updatedAt:now,marks},conflicts:merged.conflictIds.length});
 }
 return reply({error:'其他设备正在同步，请重试'},409);
}
