import {publicCloudRequest} from '@/lib/publicCloudRequest';
import {database,owner,reply} from '@/lib/syncServer';
import {hashToken} from '@/lib/plans';
async function legacyPOST(request:Request){if(!owner(request))return reply({error:'只有电脑端可以配对新设备'},401);const bytes=crypto.getRandomValues(new Uint8Array(32)),code=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),expiresAt=Date.now()+10*60*1000;await database().prepare('INSERT INTO sync_pairings (id,token_hash,expires_at,consumed) VALUES (?,?,?,0)').bind(crypto.randomUUID(),await hashToken(code),expiresAt).run();return reply({pairingUrl:`${new URL(request.url).origin}/mobile/index.html#pair=${code}`,expiresAt});}

export const POST=(request:Request)=>publicCloudRequest(request,legacyPOST);
