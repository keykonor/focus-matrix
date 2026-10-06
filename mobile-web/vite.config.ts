import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'/mobile/',plugins:[react()],build:{outDir:fileURLToPath(new URL('../public/mobile',import.meta.url)),emptyOutDir:true,assetsDir:'assets'},server:{host:'127.0.0.1',port:5184,fs:{allow:[fileURLToPath(new URL('..',import.meta.url))]},proxy:{'/api':'http://127.0.0.1:5182'}}});
