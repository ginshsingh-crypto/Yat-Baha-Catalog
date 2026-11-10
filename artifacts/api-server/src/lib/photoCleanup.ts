import { db, photos, reports } from "@workspace/db";
import { eq, lt, isNull, and } from "drizzle-orm";
import { removePhoto } from "./photos";
import { logger } from "./logger";

let running = false;
export async function cleanupPhotos() {
  if (running) return;
  running = true;
  try {
    const rows = await db.select({ id: photos.id }).from(photos).leftJoin(reports, eq(reports.photoId, photos.id))
      .where(and(isNull(reports.id), lt(photos.createdAt, new Date(Date.now() - 86400000)))).limit(100);
    for (const row of rows) await removePhoto(row.id);
    logger.info({ count: rows.length }, "Unattached photo cleanup complete");
  } catch (err) { logger.error({ err }, "Photo cleanup failed; will retry on next interval"); }
  finally { running = false; }
}
export function startPhotoCleanup() {
  void cleanupPhotos();
  setInterval(() => void cleanupPhotos(), 60 * 60 * 1000).unref();
}
