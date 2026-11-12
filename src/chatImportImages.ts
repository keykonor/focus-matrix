const MB = 1024 * 1024;
export const chatImageLimits = { count: 8, fileBytes: 10 * MB, batchBytes: 32 * MB };

export function validateChatImages(files: readonly File[]): void {
  const { count, fileBytes, batchBytes } = chatImageLimits;
  if (files.length > count) throw Error('每批最多添加 8 张截图。');
  if (files.some(file => !file.size || file.size > fileBytes)) throw Error('每张截图必须非空且不超过 10 MB。');
  if (files.some(file => !/^image\/(?:png|jpeg|webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name))) {
    throw Error('请选择 PNG、JPEG 或 WebP 截图。');
  }
  if (files.reduce((bytes, file) => bytes + file.size, 0) > batchBytes) throw Error('每批截图合计不能超过 32 MB。');
}

export function unpackChatImages(buffer: ArrayBuffer): File[] {
  if (buffer.byteLength > chatImageLimits.batchBytes + chatImageLimits.count * 4) throw Error('截图批次过大。');
  const view = new DataView(buffer);
  const files: File[] = [];
  for (let offset = 0; offset < buffer.byteLength;) {
    if (buffer.byteLength - offset < 4 || files.length >= chatImageLimits.count) throw Error('截图数据不完整。');
    const size = view.getUint32(offset, true);
    offset += 4;
    if (!size || size > buffer.byteLength - offset || size > chatImageLimits.fileBytes) throw Error('截图数据不完整。');
    // The browser decoder detects the image format from the bytes.
    files.push(new File([buffer.slice(offset, offset + size)], '拖入截图 ' + (files.length + 1) + '.png'));
    offset += size;
  }
  if (!files.length) throw Error('未读取到截图。');
  validateChatImages(files);
  return files;
}
