import {publicCloudRequest} from '@/lib/publicCloudRequest';
import {principal,reply,snapshot,sync} from '@/lib/syncServer';
async function legacyGET(request:Request){if(!await principal(request))return reply({error:'无同步权限'},401);return reply({snapshot:await snapshot()});}
const legacyPOST=sync;

export const GET=(request:Request)=>publicCloudRequest(request,legacyGET);
export const POST=(request:Request)=>publicCloudRequest(request,legacyPOST);
