import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import workerPath from 'tesseract.js/dist/worker.min.js?url';
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';

export async function readChatScreenshot(image: Blob): Promise<string> {
  if (!image.size || image.size > 10 * 1024 * 1024) throw Error('请选择不超过 10 MB 的截图。');
  const bitmap = await createImageBitmap(image).catch(() => { throw Error('无法打开截图，请选择 PNG 或 JPEG 图片。'); });
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('无法处理截图。');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fail: (error: Error) => void = () => {};
  let cancelled = false;
  try {
    const failed = new Promise<never>((_, reject) => {
      fail = reject;
      timer = setTimeout(() => reject(Error('识别超时，请裁剪截图后重试。')), 60_000);
    });
    const recognition = (async () => {
      worker = await createWorker(['chi_sim', 'eng'], OEM.LSTM_ONLY, {
        corePath, workerPath, workerBlobURL: false, cacheMethod: 'none',
        langPath: new URL('/ocr', location.href).href,
        errorHandler: () => fail(Error('OCR 识别失败，请检查截图并重试。')),
      });
      if (cancelled) { await worker.terminate(); return ''; }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const { data } = await worker.recognize(canvas);
      return data.text.trim();
    })();
    return await Promise.race([recognition, failed]);
  } finally {
    cancelled = true;
    clearTimeout(timer);
    await worker?.terminate();
  }
}
