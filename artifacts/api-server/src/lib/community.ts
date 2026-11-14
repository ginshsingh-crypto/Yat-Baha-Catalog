import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { db, moderators, reports } from "@workspace/db";
import { eq } from "drizzle-orm";
import { assertAccountActive } from './mutations';
import { validReportDate } from './reportDate';

export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export const identity = (req: Request) => getAuth(req).userId;
export const user = (req: Request) => identity(req) ?? fail(401, "سجّل الدخول للمتابعة.");
async function authenticateUser(req: Request, allowDeletionRetry = false) {
  user(req);
  if (!["GET", "HEAD"].includes(req.method) && !req.headers.authorization?.startsWith("Bearer ")) {
    const origin = req.get("origin");
    const hosts = [req.get("host"), ...(process.env.REPLIT_DOMAINS ?? "").split(","), process.env.REPLIT_EXPO_DEV_DOMAIN];
    if (!origin || !hosts.some((host) => host && origin === `https://${host}`)) fail(403, "مصدر الطلب غير مسموح.");
  }
  if (!allowDeletionRetry) await assertAccountActive(user(req));
}
export const requireUser: RequestHandler = async (req, _res, next) => {
  await authenticateUser(req, req.method === 'DELETE' && req.path === '/me');
  next();
};
export async function isModerator(id: string) {
  return !!(await db.select().from(moderators).where(eq(moderators.userId, id)))[0];
}
export const requireModerator: RequestHandler = async (req, _res, next) => {
  // Reuse authentication and cookie-origin checks before privileged mutations.
  await authenticateUser(req);
  if (!await isModerator(user(req))) fail(403, "هذه الصفحة للمشرفين فقط.");
  next();
};
export function publicReport(r: typeof reports.$inferSelect, id: string | null) {
  const { ownerId, createdAt, updatedAt, ...rest } = r;
  return { ...rest, isOwner: ownerId === id, createdAt: +createdAt, updatedAt: +updatedAt };
}

// Reject obvious contact/identity information, including Arabic digit variants.
// Human moderation is still required for contact messages; this is not identity verification.
export function privateSafe(text: string) {
  const normalized = text.normalize("NFKC").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
  if (/\d[\d\s()+.-]{7,}\d|@|https?:|www\.|wa\.me/i.test(normalized)) {
    fail(400, "لا تُرسل أرقام هواتف أو هويات أو روابط أو بريد إلكتروني. استخدم وصف الغرض ومكاناً عاماً.");
  }
}
export function validateReport(data: { date?: string; title?: string; description?: string; city?: string; place?: string }) {
  if (data.date && !validReportDate(data.date)) fail(400, "التاريخ غير صحيح أو في المستقبل.");
  for (const value of [data.title, data.description, data.city, data.place]) if (value) privateSafe(value);
}
