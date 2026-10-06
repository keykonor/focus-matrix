import {z} from 'zod';
import {database,owner,reply} from '@/lib/syncServer';
export async function GET(request:Request){if(!owner(request))return reply({error:'无设备管理权限'},401);const result=await database().prepare('SELECT id,label,revoked FROM sync_devices ORDER BY rowid DESC').all();return reply({devices:result.results});}
export async function DELETE(request:Request){if(!owner(request))return reply({error:'无设备管理权限'},401);const parsed=z.object({id:z.string().uuid()}).strict().safeParse(await request.json());if(!parsed.success)return reply({error:'无效设备'},400);await database().prepare('UPDATE sync_devices SET revoked=1 WHERE id=?').bind(parsed.data.id).run();return reply({revoked:true});}
