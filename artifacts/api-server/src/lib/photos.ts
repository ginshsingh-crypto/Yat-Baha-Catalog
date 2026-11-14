import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db, photos, reports, photoDeletions } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";
import { fail } from "./community";
import type { Transaction } from './mutations';
import { readVerifiedPhoto } from './photoBytes';
import { logger } from './logger';

export const storage = new ObjectStorageService();
function cleanFile(id: string) {
  const [bucket, ...parts] = storage.getPrivateObjectDir().replace(/^\//, "").split("/");
  return objectStorageClient.bucket(bucket!).file(`${parts.join("/")}/sanitized/${id}.jpg`);
}

export async function preparePhoto(id: string, ownerId: string, tx: Transaction) {
  // The attaching report and the cleanup worker use this same row lock.
  // Keep it until the report transaction commits, closing the orphan race.
  const [photo] = await tx.select().from(photos).where(and(eq(photos.id, id), eq(photos.ownerId, ownerId))).for('update');
  if (!photo) fail(403, "الصورة ليست مملوكة لهذا الحساب.");
  if (photo.cleanPath) {
    try { await storage.getObjectEntityFile(photo.cleanPath); return; }
    catch (err) { if ((err as Error).name !== 'ObjectNotFoundError') throw err; }
  }
  const raw = await storage.getObjectEntityFile(photo.rawPath);
  const bytes = await readVerifiedPhoto(raw, photo.size);
  let clean: Buffer;
  try {
    // Decode and re-encode a single frame, strip EXIF/GPS and reject SVG/other formats.
    const image = sharp(bytes, { limitInputPixels: 25_000_000, animated: false });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp", "heif"].includes(meta.format ?? "")) fail(400, "صيغة الصورة غير مدعومة.");
    clean = await image.rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  } catch { fail(400, "الصورة غير صالحة. اختر صورة JPEG أو PNG."); }
  // Separate immutable serving copy: an unexpired PUT URL cannot overwrite it.
  const destination = cleanFile(id);
  await destination.save(clean!, { contentType: "image/jpeg", resumable: false });
  await tx.update(photos).set({ cleanPath: `/objects/sanitized/${id}.jpg` }).where(eq(photos.id, id));
  // Raw bytes are removed only after the DB commit. A failed attachment must
  // remain retryable even if the sanitized storage write already succeeded.
}

export async function purgePreparedPhotoRaw(id: string) {
  try {
    const [photo] = await db.select().from(photos).where(eq(photos.id, id));
    if (!photo?.cleanPath) return;
    try {
      const raw = await storage.getObjectEntityFile(photo.rawPath);
      await raw.delete({ ignoreNotFound: true });
    } catch (e) { if ((e as Error).name !== 'ObjectNotFoundError') throw e; }
    if (+photo.createdAt < Date.now() - 20 * 60_000) {
      await db.update(photos).set({ rawPurgedAt: new Date() }).where(eq(photos.id, id));
    }
  } catch (err) {
    // The immutable serving copy is already committed. Cleanup will retry;
    // reporting this as a failed create would encourage duplicate reports.
    logger.error({ err, photoId: id }, 'Raw photo cleanup will be retried');
  }
}

export async function removePhotoInTransaction(id: string, tx: Transaction, onlyUnattached = false) {
  const [photo] = await tx.select().from(photos).where(eq(photos.id, id)).for('update');
  if (!photo) return;
  if (onlyUnattached) {
    const [attached] = await tx.select({ id: reports.id }).from(reports).where(eq(reports.photoId, id)).limit(1);
    if (attached) return;
  }
  await cleanFile(id).delete({ ignoreNotFound: true });
  try {
    const raw = await storage.getObjectEntityFile(photo.rawPath);
    await raw.delete({ ignoreNotFound: true });
  } catch (e) { if ((e as Error).name !== "ObjectNotFoundError") throw e; }
  const uploadExpiry = new Date(+photo.createdAt + 20 * 60_000);
  if (+uploadExpiry > Date.now()) {
    await tx.insert(photoDeletions).values({ photoId: photo.id, rawPath: photo.rawPath, notBefore: uploadExpiry }).onConflictDoNothing();
  }
  await tx.delete(photos).where(eq(photos.id, id));
}
export async function removePhoto(id: string, onlyUnattached = false) {
  await db.transaction((tx) => removePhotoInTransaction(id, tx, onlyUnattached));
}
export async function newPhoto(ownerId: string, size: number, tx: Transaction) {
  const uploadUrl = await storage.getObjectEntityUploadURL();
  const photoId = randomUUID();
  await tx.insert(photos).values({ id: photoId, ownerId, size, rawPath: storage.normalizeObjectEntityPath(uploadUrl) });
  return { photoId, uploadUrl };
}
