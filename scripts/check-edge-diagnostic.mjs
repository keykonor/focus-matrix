// Receive the temporary diagnostic URL through hidden stdin; never persist or print its token.
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');process.stdin.resume();
console.log('Ready for diagnostic URL JSON on hidden stdin.');
let input='';
process.stdin.on('data',async chunk=>{input+=chunk;if(!/[\r\n]/.test(input))return;process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);
 try{
  const {url}=JSON.parse(input.trim()),address=new URL(url),previewToken=address.searchParams.get('eo_token');
  const root=await fetch(address,{signal:AbortSignal.timeout(20000)});const cookie=root.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');console.log(JSON.stringify({origin:address.origin,rootStatus:root.status,type:root.headers.get('Content-Type')}));
  for(const path of ['/api/health','/api/sync']){
   const target=new URL(path,address);if(previewToken)target.searchParams.set('eo_token',previewToken);
   const response=await fetch(target,{headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(25000)});const body=await response.text();console.log(JSON.stringify({path,status:response.status,type:response.headers.get('Content-Type'),body:body.slice(0,600)}));
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
});
