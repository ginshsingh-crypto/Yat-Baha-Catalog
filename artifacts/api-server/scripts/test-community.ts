import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { db, reports, claims, moderators, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import sharp from "sharp";

if (process.env.NODE_ENV === "production") throw new Error("Development test only");
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const users: string[] = [];
async function account() {
  const u = await clerkClient.users.createUser({ emailAddress: [`community-${randomUUID()}@example.com`], password: randomUUID() + "!aB9" });
  users.push(u.id);
  const session = await clerkClient.sessions.createSession({ userId: u.id });
  const token = await clerkClient.sessions.getToken(session.id);
  return { id: u.id, token: token.jwt };
}
async function api(token: string | null, path: string, method = "GET", body?: unknown, expected = 200) {
  const response = await fetch(base + "/api" + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  assert.equal(response.status, expected, `${method} ${path}: ${await (response.status !== expected ? response.text() : Promise.resolve(""))}`);
  return expected === 204 ? null : response.json();
}
try {
  const a = await account(), b = await account(), mod = await account();
  await db.insert(moderators).values({ userId: mod.id });
  const input = { type: "found", title: "Integration wallet", category: "wallet", description: "A brown leather wallet at the park", city: "الرياض", place: "Public park", date: new Date().toISOString().slice(0, 10) };
  await api(null, "/reports", "POST", input, 401);
  const bytes = await sharp({ create: { width: 30, height: 30, channels: 3, background: "red" } }).jpeg().toBuffer();
  const upload = await api(a.token, "/photos", "POST", { size: bytes.length }, 201);
  const put = await fetch(upload.uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "image/jpeg" } });
  assert(put.ok);
  await api(b.token, "/reports", "POST", { ...input, photoId: upload.photoId }, 403);
  const report = await api(a.token, "/reports", "POST", { ...input, photoId: upload.photoId }, 201);
  const visible = await api(b.token, "/reports");
  assert(visible.some((r: any) => r.id === report.id && r.isOwner === false));
  assert(!JSON.stringify(visible).includes(a.id));
  const photo = await fetch(base + "/api/photos/" + upload.photoId);
  assert.equal(photo.status, 200);
  assert.equal((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).exif, undefined);
  await api(b.token, "/reports/" + report.id, "PATCH", { title: "Stolen edit" }, 404);
  await api(b.token, "/reports/" + report.id, "DELETE", undefined, 404);
  await api(a.token, "/reports/" + report.id, "PATCH", { ownerId: b.id }, 400);
  const claim = await api(b.token, "/claims", "POST", { reportId: report.id, evidence: "Private distinctive stitching detail" }, 201);
  assert.equal((await api(mod.token, "/claims")).length, 0);
  await api(mod.token, `/claims/${claim.id}/messages`, "GET", undefined, 404);
  await api(b.token, `/claims/${claim.id}`, "PATCH", { status: "accepted" }, 403);
  await api(a.token, `/claims/${claim.id}`, "PATCH", { status: "accepted" }, 204);
  const message = await api(b.token, `/claims/${claim.id}/messages`, "POST", { body: "Meet at the public information desk" }, 201);
  assert.equal((await api(a.token, `/claims/${claim.id}/messages`)).length, 0);
  await api(b.token, "/moderation", "GET", undefined, 403);
  await api(mod.token, "/moderation", "POST", { id: message.id, kind: "message", approve: true }, 204);
  assert.equal((await api(a.token, `/claims/${claim.id}/messages`)).length, 1);
  const queued = await api(b.token, `/claims/${claim.id}/messages`, "POST", { body: "Another message pending review" }, 201);
  await api(a.token, `/claims/${claim.id}`, "PATCH", { status: "rejected" }, 204);
  await api(mod.token, "/moderation", "POST", { id: queued.id, kind: "message", approve: true }, 409);
  assert.equal((await api(a.token, `/claims/${claim.id}/messages`)).length, 0);
  await api(a.token, `/claims/${claim.id}`, "PATCH", { status: "accepted" }, 204);
  await api(a.token, `/reports/${report.id}`, "PATCH", { status: "returned" }, 200);
  await api(mod.token, "/moderation", "POST", { id: queued.id, kind: "message", approve: true }, 409);
  await api(a.token, `/reports/${report.id}`, "PATCH", { status: "open" }, 200);
  await api(b.token, `/reports/${report.id}/abuse`, "POST", { reason: "Potential unsafe content" }, 204);
  const queue = await api(mod.token, "/moderation");
  const abuse = queue.find((x: any) => x.kind === "abuse" && x.reportId === report.id);
  await api(mod.token, "/moderation", "POST", { id: abuse.id, kind: "abuse", approve: true }, 204);
  await api(mod.token, "/moderation", "POST", { id: queued.id, kind: "message", approve: true }, 409);
  assert(!(await api(b.token, "/reports")).some((r: any) => r.id === report.id));
  assert.equal((await fetch(base + "/api/photos/" + upload.photoId)).status, 404);
  await api(a.token, "/reports/" + report.id, "DELETE", undefined, 204);
  assert.equal((await api(b.token, "/claims")).length, 0);
  process.stdout.write("PASS: independent Clerk sessions, shared discovery, ownership denial, private claims, moderated contact, abuse hiding, sanitized photos and deletion.\n");
} finally {
  for (const id of users) {
    await db.delete(reports).where(eq(reports.ownerId, id));
    await db.delete(claims).where(eq(claims.claimantId, id));
    await db.delete(moderators).where(eq(moderators.userId, id));
    await clerkClient.users.deleteUser(id);
  }
  await pool.end();
}
