import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, reports, photos, claims, messages, abuses, moderators, accountDeletions } from "@workspace/db";
import { and, eq, or, desc } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { CreateReportBody, UpdateReportBody, RequestPhotoUploadBody } from "@workspace/api-zod";
import { identity, user, requireUser, publicReport, validateReport, fail, isModerator } from "../lib/community";
import { newPhoto, preparePhoto, purgePreparedPhotoRaw, removePhotoInTransaction, storage } from "../lib/photos";
import { lockAccount, withAccountMutation } from '../lib/mutations';

const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.get("/reports", async (req, res) => {
  const id = identity(req);
  const rows = await db.select().from(reports).where(id ? or(eq(reports.hidden, false), eq(reports.ownerId, id)) : eq(reports.hidden, false)).orderBy(desc(reports.createdAt));
  res.json(rows.map((r) => publicReport(r, id)));
});
router.post("/reports", requireUser, async (req, res) => {
  const ownerId = user(req);
  const data = CreateReportBody.strict().parse(req.body);
  validateReport(data);
  const row = await withAccountMutation(ownerId, async (tx) => {
    if (data.photoId) await preparePhoto(data.photoId, ownerId, tx);
    const [created] = await tx.insert(reports).values({ ...data, id: randomUUID(), ownerId }).returning();
    return created!;
  });
  if (data.photoId) void purgePreparedPhotoRaw(data.photoId);
  res.status(201).json(publicReport(row!, ownerId));
});
router.patch("/reports/:id", requireUser, async (req, res) => {
  const ownerId = user(req);
  const id = String(req.params.id);
  const data = UpdateReportBody.strict().parse(req.body);
  validateReport(data);
  const row = await withAccountMutation(ownerId, async (tx) => {
    const [current] = await tx.select().from(reports).where(and(eq(reports.id, id), eq(reports.ownerId, ownerId))).for('update');
    if (!current) fail(404, "لا يمكنك تعديل هذا البلاغ.");
    if (data.photoId) await preparePhoto(data.photoId, ownerId, tx);
    const [updated] = await tx.update(reports).set({ ...data, updatedAt: new Date() }).where(eq(reports.id, id)).returning();
    return updated!;
  });
  if (data.photoId) void purgePreparedPhotoRaw(data.photoId);
  res.json(publicReport(row!, ownerId));
});
router.delete("/reports/:id", requireUser, async (req, res) => {
  const id = String(req.params.id);
  const ownerId = user(req);
  // Hide first so a storage failure cannot leave a removed photo publicly reachable.
  await withAccountMutation(ownerId, async (tx) => {
    const [row] = await tx.update(reports).set({ hidden: true }).where(and(eq(reports.id, id), eq(reports.ownerId, ownerId))).returning();
    if (!row) fail(404, "لا يمكنك حذف هذا البلاغ.");
  });
  await withAccountMutation(ownerId, async (tx) => {
    const [current] = await tx.select().from(reports).where(and(eq(reports.id, id), eq(reports.ownerId, ownerId))).for('update');
    if (!current) return;
    if (current.photoId) await removePhotoInTransaction(current.photoId, tx);
    await tx.delete(reports).where(eq(reports.id, id));
  });
  res.sendStatus(204);
});
router.post("/photos", requireUser, async (req, res) => {
  const { size } = RequestPhotoUploadBody.strict().parse(req.body);
  res.status(201).json(await withAccountMutation(user(req), (tx) => newPhoto(user(req), size, tx)));
});
router.get("/photos/:id", async (req, res) => {
  const id = String(req.params.id);
  const [report] = await db.select().from(reports).where(and(eq(reports.photoId, id), eq(reports.hidden, false)));
  if (!report) fail(404, "الصورة غير متاحة.");
  const [photo] = await db.select().from(photos).where(eq(photos.id, id));
  if (!photo?.cleanPath) fail(404, "الصورة غير متاحة.");
  const file = await storage.getObjectEntityFile(photo.cleanPath);
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("X-Content-Type-Options", "nosniff");
  file.createReadStream().on("error", (err) => res.destroy(err)).pipe(res);
});
router.get("/me", requireUser, async (req, res) => res.json({ isModerator: await isModerator(user(req)) }));
router.delete("/me", requireUser, async (req, res) => {
  const id = user(req);
  // Commit the deletion barrier first. Every mutation takes this account lock
  // and checks the barrier, including requests that started before this one.
  await db.transaction(async (tx) => {
    await lockAccount(tx, id);
    await tx.insert(accountDeletions).values({ userId: id }).onConflictDoNothing();
    await tx.update(reports).set({ hidden: true }).where(eq(reports.ownerId, id));
  });
  await db.transaction(async (tx) => {
    await lockAccount(tx, id);
    const ownedPhotos = await tx.select().from(photos).where(eq(photos.ownerId, id));
    for (const photo of ownedPhotos) await removePhotoInTransaction(photo.id, tx);
    await tx.delete(reports).where(eq(reports.ownerId, id));
    await tx.delete(claims).where(eq(claims.claimantId, id));
    await tx.delete(messages).where(eq(messages.senderId, id));
    await tx.delete(abuses).where(eq(abuses.reporterId, id));
    await tx.delete(moderators).where(eq(moderators.userId, id));
  });
  // If identity deletion fails, return an error and allow safe retry.
  try { await clerkClient.users.deleteUser(id); }
  catch (err) { if ((err as { status?: number }).status !== 404) throw err; }
  res.sendStatus(204);
});
export default router;
