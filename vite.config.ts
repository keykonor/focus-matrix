import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const ocrFiles = new Map([
  ['chi_sim.traineddata.gz', require.resolve('@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz')],
  ['eng.traineddata.gz', require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')],
  ['LICENSE.txt', require.resolve('tesseract.js-core/LICENSE')],
]);
const offlineOcr: Plugin = {
  name: 'offline-ocr',
  configureServer(server) {
    server.middlewares.use('/ocr', (request, response, next) => {
      const source = ocrFiles.get(request.url?.slice(1) ?? '');
      if (!source) return next();
      response.setHeader('Content-Type', 'application/octet-stream');
      response.end(readFileSync(source));
    });
  },
  generateBundle() {
    for (const [name, path] of ocrFiles) {
      this.emitFile({ type: 'asset', fileName: 'ocr/' + name, source: readFileSync(path) });
    }
  },
};

export default defineConfig({
  plugins: [react(), offlineOcr],
  clearScreen: false,
  server: {
    host: '127.0.0.1', port: 1420, strictPort: true,
    watch: { ignored: ['**/src-tauri/target/**', '**/.cargo/**', '**/.rustup/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: 'chrome105' },
});
