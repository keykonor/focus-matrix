// One-time, lossless migration into an empty CloudBase database. Input is hidden.
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
const input=await new Promise((resolve,reject)=>{
 console.log('Ready for original database metadata on hidden stdin.');
 let buffer=''; const terminal=Boolean(process.stdin.isTTY);
 if(terminal)process.stdin.setRawMode(true);
 process.stdin.setEncoding('utf8');process.stdin.resume();
 const receive=chunk=>{if(chunk.includes('\u0003')){if(terminal)process.stdin.setRawMode(false);process.stdin.pause();reject(Error('Cancelled'));return;}buffer+=chunk;if(!/[\r\n]/.test(buffer))return;process.stdin.off('data',receive);if(terminal)process.stdin.setRawMode(false);process.stdin.pause();try{resolve(JSON.parse(buffer.trim()));}catch{reject(Error('Invalid input'));}};
 process.stdin.on('data',receive);
});
const config=JSON.parse(await readFile('cloudbase/cloudbaserc.json','utf8')).functions.find(f=>f.name==='focus-matrix-api').envVariables;
const original=JSON.parse(await readFile('cloud-site/lib/publicCloudConfig.json','utf8')).legacyOrigin;
const oldResponse=await fetch(original+'/api/sync',{headers:{Authorization:'Bearer '+config.FOCUS_MATRIX_WRITE_TOKEN},signal:AbortSignal.timeout(30000)});
assert.equal(oldResponse.status,200,'Original cloud snapshot unavailable; migration stopped');
const snapshot=(await oldResponse.json()).snapshot;
const tables=input.tables;
assert.equal(tables.sync_state.length,1);
const state=tables.sync_state[0];
assert.equal(state.revision,snapshot.revision,'Cloud changed during capture');
const full=JSON.stringify(snapshot.content);
// The database viewer bounds long cells. The complete current content comes from
// the authenticated API; reuse it only for the identical, sole initial version.
const complete=cell=>{try{JSON.parse(cell);return cell;}catch{
 const marker='… [truncated for model]';assert.ok(cell.endsWith(marker),'Unknown cell format');
 assert.ok(full.startsWith(cell.slice(0,-marker.length)),'Snapshot differs from bounded database cell');
 return full;
}};
state.content=complete(state.content);
assert.equal(tables.sync_versions.length,1,'Multiple historical versions require a full server export');
assert.equal(tables.sync_versions[0].revision,state.revision);
assert.equal(tables.sync_versions[0].updated_at,state.updated_at);
assert.equal(tables.sync_changes.length,0,'Historical edits require a full server export');
tables.sync_versions[0].content=complete(tables.sync_versions[0].content);
for(const row of tables.shared_plans)row.content=complete(row.content);
// The new schema adds a sorting field; zero preserves the old unknown timestamp.
for(const row of tables.sync_devices)row.created_at??=0;
const backup=spawnSync('powershell.exe',['-NoProfile','-Command',
 "Add-Type -AssemblyName System.Security; $json=[Console]::In.ReadToEnd(); $bytes=[Text.Encoding]::UTF8.GetBytes($json); $encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); $directory=Join-Path $env:APPDATA 'com.focusmatrix.desktop/backups'; $file=Join-Path $directory ('cloud-migration-'+[guid]::NewGuid().ToString()+'.bin'); [IO.File]::WriteAllBytes($file,$encrypted); [Array]::Clear($bytes,0,$bytes.Length); Write-Output $file"
],{input:JSON.stringify(tables),encoding:'utf8'});
assert.equal(backup.status,0,'Encrypted migration backup failed');
console.log('Original cloud records backed up using current-user DPAPI.');
const rest=async(table,method='GET',body)=>{
 const response=await fetch(`https://${config.TCB_ENV}.api.tcloudbasegateway.com/v1/rdb/rest/${table}?select=*`,{method,headers:{Authorization:'Bearer '+config.CLOUDBASE_API_KEY,...(body?{'Content-Type':'application/json',Prefer:'return=representation'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 assert.ok(response.ok,`CloudBase ${table} ${method}: HTTP ${response.status}`);
 return response.status===204?[]:response.json();
};
for(const table of Object.keys(tables))assert.equal((await rest(table)).length,0,`Target ${table} is not empty; stopped`);
for(const [table,rows] of Object.entries(tables)){
 if(rows.length)await rest(table,'POST',rows);
 const actual=await rest(table),key=table==='sync_versions'?'revision':'id';
 const sorted=value=>[...value].sort((a,b)=>String(a[key]).localeCompare(String(b[key])));
 assert.ok(isDeepStrictEqual(sorted(actual),sorted(rows)),`Verification failed: ${table}`);
 console.log(JSON.stringify({table,verified:true,rows:rows.length}));
}
console.log('Migration verified; original database is retained unchanged.');
