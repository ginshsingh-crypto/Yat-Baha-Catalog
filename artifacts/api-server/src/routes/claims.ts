import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, or, desc } from "drizzle-orm";
import { db, claims, reports, messages, abuses } from "@workspace/db";
import { CreateClaimBody, DecideClaimBody, SendMessageBody, ReportAbuseBody, ModerateItemBody } from "@workspace/api-zod";
import { user, requireUser, requireModerator, privateSafe, fail } from "../lib/community";
import { withAccountMutation, type Transaction } from '../lib/mutations';

const router = Router();
async function participant(id: string, uid: string, connection: Transaction | typeof db = db, lock = false) {
  const query = connection.select({ claim: claims, report: reports }).from(claims).innerJoin(reports, eq(claims.reportId, reports.id)).where(eq(claims.id, id));
  const [row] = await (lock ? query.for('update') : query);
  if (!row || (row.claim.claimantId !== uid && row.report.ownerId !== uid)) fail(404, "الطلب غير متاح.");
  return row;
}
function claimView(row: { claim: typeof claims.$inferSelect; report: typeof reports.$inferSelect }, uid: string) {
  return { id: row.claim.id, reportId: row.report.id, reportTitle: row.report.title, evidence: row.claim.evidence, status: row.claim.status, incoming: row.report.ownerId === uid, createdAt: +row.claim.createdAt };
}
const messageView = (m: typeof messages.$inferSelect, uid: string) => ({ id: m.id, body: m.body, status: m.status, mine: m.senderId === uid, createdAt: +m.createdAt });

router.get("/claims", requireUser, async (req, res) => {
  const uid = user(req);
  const rows = await db.select({ claim: claims, report: reports }).from(claims).innerJoin(reports, eq(claims.reportId, reports.id))
    .where(or(eq(claims.claimantId, uid), eq(reports.ownerId, uid))).orderBy(desc(claims.createdAt));
  res.json(rows.map((r) => claimView(r, uid)));
});
router.post("/claims", requireUser, async (req, res) => {
  const uid = user(req);
  const data = CreateClaimBody.strict().parse(req.body);
  privateSafe(data.evidence);
  const view = await withAccountMutation(uid, async (tx) => {
    const [report] = await tx.select().from(reports).where(eq(reports.id, data.reportId)).for('update');
    if (!report || report.hidden || report.status !== "open") fail(404, "البلاغ غير متاح لطلب جديد.");
    if (report.ownerId === uid) fail(400, "لا يمكنك المطالبة ببلاغك.");
    const [claim] = await tx.insert(claims).values({ ...data, claimantId: uid, id: randomUUID() }).returning();
    return claimView({ claim: claim!, report }, uid);
  });
  res.status(201).json(view);
});
router.patch("/claims/:id", requireUser, async (req, res) => {
  const uid = user(req);
  const data = DecideClaimBody.strict().parse(req.body);
  await withAccountMutation(uid, async (tx) => {
    const { claim, report } = await participant(String(req.params.id), uid, tx, true);
    if (report.ownerId !== uid) fail(403, "صاحب البلاغ وحده يمكنه اتخاذ القرار.");
    if (data.status === "accepted" && (report.hidden || report.status !== "open")) fail(409, "البلاغ مغلق أو مخفي.");
    await tx.update(claims).set(data).where(eq(claims.id, claim.id));
  });
  res.sendStatus(204);
});
router.delete("/claims/:id", requireUser, async (req, res) => {
  await withAccountMutation(user(req), async (tx) => {
    const { claim } = await participant(String(req.params.id), user(req), tx, true);
    if (claim.claimantId !== user(req)) fail(403, "مقدم الطلب وحده يمكنه سحبه.");
    await tx.delete(claims).where(eq(claims.id, claim.id));
  });
  res.sendStatus(204);
});
router.get("/claims/:id/messages", requireUser, async (req, res) => {
  const uid = user(req);
  const { claim, report } = await participant(String(req.params.id), uid);
  if (claim.status !== "accepted" || report.hidden || report.status !== "open") {
    res.json([]); return;
  }
  const rows = await db.select().from(messages).where(and(eq(messages.claimId, claim.id), or(eq(messages.status, "approved"), eq(messages.senderId, uid)))).orderBy(messages.createdAt);
  res.json(rows.map((m) => messageView(m, uid)));
});
router.post("/claims/:id/messages", requireUser, async (req, res) => {
  const uid = user(req);
  const data = SendMessageBody.strict().parse(req.body);
  privateSafe(data.body);
  const message = await withAccountMutation(uid, async (tx) => {
    const { claim, report } = await participant(String(req.params.id), uid, tx, true);
    if (claim.status !== "accepted" || report.hidden || report.status !== "open") fail(403, "التواصل متاح بعد قبول الطلب وعلى بلاغ مفتوح فقط.");
    const [created] = await tx.insert(messages).values({ ...data, id: randomUUID(), claimId: claim.id, senderId: uid }).returning();
    return created!;
  });
  res.status(201).json(messageView(message!, uid));
});
router.post("/reports/:id/abuse", requireUser, async (req, res) => {
  const reportId = String(req.params.id);
  const data = ReportAbuseBody.strict().parse(req.body);
  privateSafe(data.reason);
  await withAccountMutation(user(req), async (tx) => {
    const [report] = await tx.select().from(reports).where(and(eq(reports.id, reportId), eq(reports.hidden, false))).for('update');
    if (!report) fail(404, "البلاغ غير متاح.");
    await tx.insert(abuses).values({ ...data, id: randomUUID(), reportId, reporterId: user(req) });
  });
  res.sendStatus(204);
});
router.get("/moderation", requireModerator, async (_req, res) => {
  const pendingMessages = await db.select({ id: messages.id, text: messages.body, reportId: reports.id, reportTitle: reports.title }).from(messages)
    .innerJoin(claims, eq(messages.claimId, claims.id)).innerJoin(reports, eq(claims.reportId, reports.id)).where(eq(messages.status, "pending"));
  const pendingAbuse = await db.select({ id: abuses.id, text: abuses.reason, reportId: reports.id, reportTitle: reports.title }).from(abuses)
    .innerJoin(reports, eq(abuses.reportId, reports.id)).where(eq(abuses.status, "pending"));
  res.json([...pendingMessages.map((m) => ({ ...m, kind: "message" })), ...pendingAbuse.map((a) => ({ ...a, kind: "abuse" }))]);
});
router.post("/moderation", requireModerator, async (req, res) => {
  const data = ModerateItemBody.strict().parse(req.body);
  await withAccountMutation(user(req), async (tx) => {
    if (data.kind === "message") {
      const [row] = await tx.select({ message: messages, claim: claims, report: reports }).from(messages)
        .innerJoin(claims, eq(messages.claimId, claims.id)).innerJoin(reports, eq(claims.reportId, reports.id)).where(eq(messages.id, data.id)).for('update');
      if (!row) fail(404, "الرسالة غير موجودة.");
      if (row.message.senderId === user(req)) fail(403, "لا يمكنك مراجعة رسالتك بنفسك.");
      if (row.message.status !== 'pending' || (data.approve && (row.claim.status !== 'accepted' || row.report.status !== 'open' || row.report.hidden))) fail(409, "تمت مراجعة الرسالة بالفعل أو أُغلق التواصل.");
      await tx.update(messages).set({ status: data.approve ? 'approved' : 'rejected', reviewedBy: user(req) }).where(eq(messages.id, data.id));
    } else {
      const [abuse] = await tx.update(abuses).set({ status: data.approve ? "upheld" : "dismissed", reviewedBy: user(req) })
        .where(and(eq(abuses.id, data.id), eq(abuses.status, "pending"))).returning();
      if (!abuse) fail(409, "تمت مراجعة الشكوى بالفعل.");
      if (data.approve) await tx.update(reports).set({ hidden: true, updatedAt: new Date() }).where(eq(reports.id, abuse.reportId));
    }
  });
  res.sendStatus(204);
});
export default router;
