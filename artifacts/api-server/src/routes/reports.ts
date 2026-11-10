import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, reports, photos, claims, messages, abuses, moderators } from "@workspace/db";
import { and, eq, or, desc } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { CreateReportBody, UpdateReportBody, RequestPhotoUploadBody } from "@workspace/api-zod";
import { identity, user, requireUser, publicReport, validateReport, fail, isModerator } from "../lib/community";
import { newPhoto, preparePhoto, removePhoto, storage } from "../lib/photos";

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
  if (data.photoId) await preparePhoto(data.photoId, ownerId);
  const [row] = await db.insert(reports).values({ ...data, id: randomUUID(), ownerId }).returning();
  res.status(201).json(publicReport(row!, ownerId));
});
router.patch("/reports/:id", requireUser, async (req, res) => {
  const ownerId = user(req);
  const id = String(req.params.id);
  const [current] = await db.select().from(reports).where(and(eq(reports.id, id), eq(reports.ownerId, ownerId)));
  if (!current) fail(404, "لا يمكنك تعديل هذا البلاغ.");
  const data = UpdateReportBody.strict().parse(req.body);
  validateReport(data);
  if (data.photoId) await preparePhoto(data.photoId, ownerId);
  const [row] = await db.update(reports).set({ ...data, updatedAt: new Date() }).where(and(eq(reports.id, id), eq(reports.ownerId, ownerId))).returning();
  res.json(publicReport(row!, ownerId));
});
router.delete("/reports/:id", requireUser, async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.select().from(reports).where(and(eq(reports.id, id), eq(reports.ownerId, user(req))));
  if (!row) fail(404, "لا يمكنك حذف هذا البلاغ.");
  // Hide first so a storage failure cannot leave a removed photo publicly reachable.
  await db.update(reports).set({ hidden: true }).where(eq(reports.id, id));
  if (row.photoId) await removePhoto(row.photoId);
  await db.delete(reports).where(and(eq(reports.id, id), eq(reports.ownerId, user(req))));
  res.sendStatus(204);
});
router.post("/photos", requireUser, async (req, res) => {
  const { size } = RequestPhotoUploadBody.strict().parse(req.body);
  res.status(201).json(await newPhoto(user(req), size));
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
  await db.update(reports).set({ hidden: true }).where(eq(reports.ownerId, id));
  const ownedPhotos = await db.select().from(photos).where(eq(photos.ownerId, id));
  for (const photo of ownedPhotos) await removePhoto(photo.id);
  await db.transaction(async (tx) => {
    await tx.delete(reports).where(eq(reports.ownerId, id));
    await tx.delete(claims).where(eq(claims.claimantId, id));
    await tx.delete(messages).where(eq(messages.senderId, id));
    await tx.delete(abuses).where(eq(abuses.reporterId, id));
    await tx.delete(moderators).where(eq(moderators.userId, id));
  });
  // If identity deletion fails, return an error and allow safe retry.
  await clerkClient.users.deleteUser(id);
  res.sendStatus(204);
});
export default router;
