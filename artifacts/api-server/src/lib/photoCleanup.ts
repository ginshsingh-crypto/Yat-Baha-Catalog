import { db, photos, reports, photoDeletions } from "@workspace/db";
import { eq, lt, isNull, isNotNull, and } from "drizzle-orm";
import { removePhoto, purgePreparedPhotoRaw, storage } from "./photos";
import { logger } from "./logger";

let running = false;
export async function cleanupPhotos() {
  if (running) return;
  running = true;
  try {
    const rows = await db.select({ id: photos.id }).from(photos).leftJoin(reports, eq(reports.photoId, photos.id))
      .where(and(isNull(reports.id), lt(photos.createdAt, new Date(Date.now() - 86400000)))).limit(100);
    for (const row of rows) {
      try { await removePhoto(row.id, true); }
      catch (err) { logger.error({ err, photoId: row.id }, 'Photo cleanup will retry this item'); }
    }
    // An upload URL can be reused until it expires. Sweep attached raw copies
    // after that window too, while leaving sanitized serving images intact.
    const prepared = await db.select({ id: photos.id }).from(photos)
      .where(and(isNotNull(photos.cleanPath), isNull(photos.rawPurgedAt), lt(photos.createdAt, new Date(Date.now() - 20 * 60_000)))).limit(100);
    for (const photo of prepared) await purgePreparedPhotoRaw(photo.id);
    const deleted = await db.select().from(photoDeletions).where(lt(photoDeletions.notBefore, new Date())).limit(100);
    for (const pending of deleted) {
      try {
        await db.transaction(async (tx) => {
          const [entry] = await tx.select().from(photoDeletions).where(eq(photoDeletions.photoId, pending.photoId)).for('update');
          if (!entry || +entry.notBefore > Date.now()) return;
          try {
            const raw = await storage.getObjectEntityFile(entry.rawPath);
            await raw.delete({ ignoreNotFound: true });
          } catch (err) { if ((err as Error).name !== 'ObjectNotFoundError') throw err; }
          await tx.delete(photoDeletions).where(eq(photoDeletions.photoId, entry.photoId));
        });
      } catch (err) { logger.error({ err, photoId: pending.photoId }, 'Deleted upload cleanup will retry'); }
    }
    logger.info({ count: rows.length }, "Unattached photo cleanup complete");
  } catch (err) { logger.error({ err }, "Photo cleanup failed; will retry on next interval"); }
  finally { running = false; }
}
export function startPhotoCleanup() {
  void cleanupPhotos();
  setInterval(() => void cleanupPhotos(), 60 * 60 * 1000).unref();
}
