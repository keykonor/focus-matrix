// Set a public address only after an unauthenticated, direct (non-proxy) live health check.
import {readFile,writeFile} from 'node:fs/promises';
const value=process.argv[2];
if(!value)throw Error('请提供已认领并正式部署的公网 HTTPS 地址；禁止使用临时预览链接。');
const url=new URL(value);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.hostname.endsWith('.edgeone.cool'))throw Error('只能使用无访问令牌、无临时预览参数的正式 HTTPS 地址。');
if(process.execArgv.includes('--use-env-proxy'))throw Error('此检查必须直接连接，不能依赖电脑代理。');
const response=await fetch(url.origin+'/api/health',{redirect:'error',signal:AbortSignal.timeout(20000)});
if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))throw Error('公网入口无法直接访问，尚未修改软件连接地址。');
const health=await response.json();if(health.ok!==true||health.protocol!==1||!(health.service==='focus-matrix'||health.service==='focus-matrix-gateway'&&health.upstreamReachable===true))throw Error('公网同步服务或数据库回源检查未通过，尚未修改软件连接地址。');
for(const [path,status] of [['/api/plan',404],['/api/sync',401],['/api/devices',401]]){
 const denied=await fetch(url.origin+path,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(denied.status!==status||!denied.headers.get('Content-Type')?.includes('application/json'))throw Error('匿名访问权限检查失败，尚未修改软件连接地址。');
}
const path=new URL('../cloud-site/lib/publicCloudConfig.json',import.meta.url),config=JSON.parse(await readFile(path,'utf8'));
await writeFile(path,JSON.stringify({...config,apiOrigin:url.origin,publicOrigin:url.origin},null,2)+'\n');
console.log('已验证并配置正式公网地址；请重新构建、检查，再通过备份脚本更新安装版。');
