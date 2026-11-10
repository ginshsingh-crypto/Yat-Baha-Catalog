import { db, photos, reports, pool } from "@workspace/db";
import { eq, lt, isNull, and } from "drizzle-orm";
import { removePhoto } from "../src/lib/photos";

// Schedule daily in the environment being maintained. No raw photos are public.
try {
  const rows = await db.select({ id: photos.id }).from(photos).leftJoin(reports, eq(reports.photoId, photos.id))
    .where(and(isNull(reports.id), lt(photos.createdAt, new Date(Date.now() - 86400000))));
  for (const row of rows) await removePhoto(row.id);
  process.stdout.write(`Removed ${rows.length} unattached photos older than one day.\n`);
} finally { await pool.end(); }
