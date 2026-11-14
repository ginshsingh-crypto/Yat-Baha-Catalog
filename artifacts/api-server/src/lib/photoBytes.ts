import type { File } from '@google-cloud/storage';

export const MAX_PHOTO_BYTES = 6_000_000;

export async function readVerifiedPhoto(file: File, declaredSize: number): Promise<Buffer> {
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PHOTO_BYTES || size !== declaredSize || !metadata.generation) {
    throw Object.assign(new Error('حجم الصورة غير صالح.'), { status: 400 });
  }
  // Pin the exact version checked above. A still-valid upload URL can replace
  // the raw object, but that replacement must never become this download.
  const version = file.bucket.file(file.name, { generation: metadata.generation });
  const stream = version.createReadStream({ start: 0, end: MAX_PHOTO_BYTES, validation: false, decompress: false });
  const timeout = setTimeout(() => stream.destroy(new Error('انتهت مهلة قراءة الصورة. حاول مجدداً.')), 30_000);
  timeout.unref();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_PHOTO_BYTES || length > declaredSize) {
        throw Object.assign(new Error('حجم الصورة غير صالح.'), { status: 400 });
      }
      chunks.push(bytes);
    }
    if (length !== declaredSize) throw Object.assign(new Error('لم يكتمل رفع الصورة. أعد المحاولة.'), { status: 400 });
    return Buffer.concat(chunks, length);
  } finally {
    clearTimeout(timeout);
    stream.destroy();
  }
}
