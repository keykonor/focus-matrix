import {z} from 'zod';
import {database,reply,snapshot,bearer} from '@/lib/syncServer';
import {hashToken} from '@/lib/plans';
export async function POST(request:Request){const code=bearer(request);if(!code)return reply({error:'请使用电脑生成的配对链接'},401);let body:unknown;try{body=await request.json();}catch{return reply({error:'无效数据'},400);}const parsed=z.object({label:z.string().trim().min(1).max(40)}).strict().safeParse(body);if(!parsed.success)return reply({error:'请填写设备名称'},400);
 const db=database(),pair=await db.prepare('UPDATE sync_pairings SET consumed=1 WHERE token_hash=? AND consumed=0 AND expires_at>? RETURNING id').bind(await hashToken(code),Date.now()).first<{id:string}>();if(!pair)return reply({error:'配对链接已过期或已使用，请在电脑上重新生成'},401);
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID();await db.prepare('INSERT INTO sync_devices (id,token_hash,label,revoked) VALUES (?,?,?,0)').bind(id,await hashToken(token),parsed.data.label).run();return reply({deviceToken:token,deviceId:id,snapshot:await snapshot()});}
