import { env } from 'cloudflare:workers';
import { equalToken, hashToken, uploadSchema } from '@/lib/plans';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
function reply(body:unknown,status=200) {return Response.json(body,{status,headers});}
function bearer(request:Request) { return request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]??''; }
function writer(request:Request) {const secret=(env as Cloudflare.Env & {FOCUS_MATRIX_WRITE_TOKEN?:string}).FOCUS_MATRIX_WRITE_TOKEN;return !!secret&&equalToken(bearer(request),secret);}
export async function GET(request:Request) {
  const token=bearer(request); if(!token||!env.DB) return reply({error:'链接无效或分享已关闭'},404);
  const row=await env.DB.prepare('SELECT content, view_token_hash, updated_at FROM shared_plans WHERE id = ?').bind('main').first<{content:string;view_token_hash:string;updated_at:number}>();
  if(!row||!equalToken(await hashToken(token),row.view_token_hash)) return reply({error:'链接无效或分享已关闭'},404);
  return reply({content:JSON.parse(row.content),updatedAt:row.updated_at});
}
export async function PUT(request:Request) {
  if(!writer(request)) return reply({error:'无写入权限'},401);
  if(!env.DB) return reply({error:'云端存储尚未准备好'},503);
  const raw=await request.text(); if(new TextEncoder().encode(raw).length>5_000_000) return reply({error:'内容过大'},413);
  let json:unknown; try {json=JSON.parse(raw);} catch {return reply({error:'无效数据'},400);}
  const parsed=uploadSchema.safeParse(json); if(!parsed.success) return reply({error:'计划格式无效'},400);
  const updatedAt=Date.now();
  await env.DB.prepare('INSERT INTO shared_plans (id,content,view_token_hash,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content, view_token_hash=excluded.view_token_hash, updated_at=excluded.updated_at').bind('main',JSON.stringify(parsed.data.content),await hashToken(parsed.data.viewToken),updatedAt).run();
  return reply({updatedAt});
}
export async function DELETE(request:Request) {
  if(!writer(request)) return reply({error:'无写入权限'},401);
  if(!env.DB) return reply({error:'云端存储尚未准备好'},503);
  await env.DB.prepare('DELETE FROM shared_plans WHERE id = ?').bind('main').run();
  return reply({disabled:true});
}
