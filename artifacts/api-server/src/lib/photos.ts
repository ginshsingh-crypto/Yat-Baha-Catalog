import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db, photos } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";
import { fail } from "./community";

export const storage = new ObjectStorageService();
function cleanFile(id: string) {
  const [bucket, ...parts] = storage.getPrivateObjectDir().replace(/^\//, "").split("/");
  return objectStorageClient.bucket(bucket!).file(`${parts.join("/")}/sanitized/${id}.jpg`);
}

export async function preparePhoto(id: string, ownerId: string) {
  const [photo] = await db.select().from(photos).where(and(eq(photos.id, id), eq(photos.ownerId, ownerId)));
  if (!photo) fail(403, "الصورة ليست مملوكة لهذا الحساب.");
  if (photo.cleanPath) return;
  const raw = await storage.getObjectEntityFile(photo.rawPath);
  const [metadata] = await raw.getMetadata();
  if (Number(metadata.size) > 6_000_000 || Number(metadata.size) !== photo.size) fail(400, "حجم الصورة غير صالح.");
  const [bytes] = await raw.download();
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
  await db.update(photos).set({ cleanPath: `/objects/sanitized/${id}.jpg` }).where(eq(photos.id, id));
  await raw.delete({ ignoreNotFound: true });
}

export async function removePhoto(id: string) {
  const [photo] = await db.select().from(photos).where(eq(photos.id, id));
  if (!photo) return;
  await cleanFile(id).delete({ ignoreNotFound: true });
  try {
    const raw = await storage.getObjectEntityFile(photo.rawPath);
    await raw.delete({ ignoreNotFound: true });
  } catch (e) { if ((e as Error).name !== "ObjectNotFoundError") throw e; }
  await db.delete(photos).where(eq(photos.id, id));
}
export async function newPhoto(ownerId: string, size: number) {
  const uploadUrl = await storage.getObjectEntityUploadURL();
  const photoId = randomUUID();
  await db.insert(photos).values({ id: photoId, ownerId, size, rawPath: storage.normalizeObjectEntityPath(uploadUrl) });
  return { photoId, uploadUrl };
}
