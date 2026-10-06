import {principal,reply,snapshot,sync} from '@/lib/syncServer';
export async function GET(request:Request){if(!await principal(request))return reply({error:'无同步权限'},401);return reply({snapshot:await snapshot()});}
export const POST=sync;
