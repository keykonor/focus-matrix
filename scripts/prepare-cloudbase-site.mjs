import {mkdir,cp,copyFile,readFile,writeFile} from 'node:fs/promises';
const directory='cloudbase/functions/focus-matrix-api/public';
await mkdir(directory,{recursive:true});
await cp('cloud-site/public/mobile',directory+'/mobile',{recursive:true});
await mkdir(directory+'/downloads',{recursive:true});
await copyFile('outputs/FocusMatrix-Android.apk',directory+'/downloads/FocusMatrix-Android.apk');
const html=await readFile(directory+'/mobile/index.html','utf8');
await writeFile(directory+'/index.html',html.replace('<head>','<head><script>if(/^#[a-f0-9]{64}$/.test(location.hash)){history.replaceState(null,"", "#share="+location.hash.slice(1));}</script>'));
console.log('Bundled share/mobile pages and APK prepared without credentials or user content.');
