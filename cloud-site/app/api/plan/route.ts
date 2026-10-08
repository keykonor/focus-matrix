import {publicCloudRequest} from '@/lib/publicCloudRequest';
import {contentSchema,uploadSchema,sharingSchema,hashToken,equalToken} from '@/lib/plans';
import {database,reply,bearer,owner,snapshot} from '@/lib/syncServer';
async function legacyGET(request:Request){
 const token=bearer(request);if(!token)return reply({error:'链接无效或分享已关闭'},404);
 const db=database(),row=await db.prepare('SELECT * FROM shared_plans WHERE id=?').bind('main').first<{content:string;view_token_hash:string;updated_at:number;editable:number}>();
 if(!row||!equalToken(await hashToken(token),row.view_token_hash))return reply({error:'链接无效或分享已关闭'},404);
 const current=await db.prepare('SELECT content,revision,updated_at,marks FROM sync_state WHERE id=?').bind('main').first<{content:string;revision:number;updated_at:number;marks:string}>();
 return reply({content:contentSchema.parse(JSON.parse(current?.content??row.content)),updatedAt:current?.updated_at??row.updated_at,revision:current?.revision??0,marks:current?JSON.parse(current.marks):{},editable:!!row.editable});
}
async function legacyPUT(request:Request){
 if(!owner(request))return reply({error:'无分享管理权限'},401);
 const raw=await request.text();if(new TextEncoder().encode(raw).length>5_000_000)return reply({error:'内容过大'},413);let body:unknown;try{body=JSON.parse(raw);}catch{return reply({error:'无效数据'},400);}
 const settings=sharingSchema.safeParse(body),db=database();
 if(settings.success){const current=await snapshot();await db.prepare('INSERT INTO shared_plans (id,content,view_token_hash,updated_at,editable) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,view_token_hash=excluded.view_token_hash,updated_at=excluded.updated_at,editable=excluded.editable').bind('main',JSON.stringify(current.content),await hashToken(settings.data.viewToken),current.updatedAt,settings.data.editingEnabled?1:0).run();return reply({updatedAt:current.updatedAt});}
 const legacy=uploadSchema.safeParse(body);if(!legacy.success)return reply({error:'分享格式无效'},400);
 // An older desktop must never replace mobile/collaborative revisions wholesale.
 if(await db.prepare('SELECT id FROM sync_state WHERE id=?').bind('main').first())return reply({error:'请更新电脑客户端以启用双向同步'},409);
 const now=Date.now();await db.prepare('INSERT INTO shared_plans (id,content,view_token_hash,updated_at,editable) VALUES (?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET content=excluded.content,view_token_hash=excluded.view_token_hash,updated_at=excluded.updated_at').bind('main',JSON.stringify(legacy.data.content),await hashToken(legacy.data.viewToken),now).run();return reply({updatedAt:now});
}
async function legacyDELETE(request:Request){if(!owner(request))return reply({error:'无分享管理权限'},401);await database().prepare('DELETE FROM shared_plans WHERE id=?').bind('main').run();return reply({disabled:true});}

export const GET=(request:Request)=>publicCloudRequest(request,legacyGET);
export const PUT=(request:Request)=>publicCloudRequest(request,legacyPUT);
export const DELETE=(request:Request)=>publicCloudRequest(request,legacyDELETE);
