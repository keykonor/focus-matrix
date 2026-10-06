import {createGateway} from '../../proxy.mjs';
const handle=createGateway();
export async function onRequest(context){return handle(context.request);}
