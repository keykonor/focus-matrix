import {bearer,database,reply} from '@/lib/syncServer';
import {hashToken} from '@/lib/plans';

// A phone may revoke only its own credential. Sharing and owner keys cannot use this route.
export async function DELETE(request:Request){
 const token=bearer(request);
 if(!token)return reply({error:'无手机连接凭据'},401);
 const db=database(),hashed=await hashToken(token);
 const device=await db.prepare('SELECT id FROM sync_devices WHERE token_hash=?').bind(hashed).first<{id:string}>();
 if(!device)return reply({error:'无手机连接权限'},401);
 await db.prepare('UPDATE sync_devices SET revoked=1 WHERE id=?').bind(device.id).run();
 return reply({revoked:true});
}
