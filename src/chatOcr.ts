import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import workerPath from 'tesseract.js/dist/worker.min.js?url';
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';

async function prepareScreenshot(image: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(image).catch(() => { throw Error('无法打开截图，请选择 PNG 或 JPEG 图片。'); });
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(bitmap.width < 1000 ? 2 : 1, 4096 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('无法处理截图。');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const edge = context.getImageData(0, 0, canvas.width, 1).data;
    let brightness = 0;
    for (let offset = 0; offset < edge.length; offset += 4) {
      brightness += (edge[offset] + edge[offset + 1] + edge[offset + 2]) / 3;
    }
    if (brightness / canvas.width < 96) {
      context.filter = 'invert(1)';
      context.drawImage(canvas, 0, 0);
    }
  } finally {
    bitmap.close();
  }
  return canvas;
}

export async function readChatScreenshots(images: Blob[], progress: (current: number, total: number) => void, signal?: AbortSignal): Promise<string[]> {
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fail: (error: Error) => void = () => {};
  let cancelled = false;
  const abort = () => fail(Error('提取已取消。'));
  try {
    const failed = new Promise<never>((_, reject) => {
      fail = reject;
      timer = setTimeout(() => reject(Error('识别超时，请减少截图数量或裁剪后重试。')), 60_000 + images.length * 15_000);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    const recognition = (async () => {
      worker = await createWorker(['chi_sim', 'eng'], OEM.LSTM_ONLY, {
        corePath, workerPath, workerBlobURL: false, cacheMethod: 'none',
        langPath: new URL('/ocr', location.href).href,
        errorHandler: () => fail(Error('OCR 识别失败，请检查截图并重试。')),
      });
      if (cancelled) { await worker.terminate(); return []; }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const texts: string[] = [];
      for (const [index, image] of images.entries()) {
        if (cancelled) break;
        progress(index + 1, images.length);
        const canvas = await prepareScreenshot(image).catch(() => { throw Error('无法打开第 ' + (index + 1) + ' 张截图。'); });
        if (cancelled) break;
        const { data } = await worker.recognize(canvas);
        if (!data.text.trim()) throw Error('第 ' + (index + 1) + ' 张截图未识别到文字，请移除或更换。');
        texts.push(data.text.trim());
      }
      return texts;
    })();
    return await Promise.race([recognition, failed]);
  } finally {
    cancelled = true;
    signal?.removeEventListener('abort', abort);
    clearTimeout(timer);
    await worker?.terminate();
  }
}
