import { clerkClient } from "@clerk/express";
import { db, moderators, pool } from "@workspace/db";
import { eq } from "drizzle-orm";

// Run only by a workspace/server operator, never through a public endpoint.
const [action, email] = process.argv.slice(2);
if (!["grant", "revoke"].includes(action ?? "") || !email?.includes("@")) {
  throw new Error("Usage: pnpm --filter @workspace/api-server moderator grant|revoke <verified-account-email>");
}
try {
  const result = await clerkClient.users.getUserList({ emailAddress: [email], limit: 2 });
  const account = result.data.find((u) => u.emailAddresses.some((e) => e.emailAddress.toLowerCase() === email.toLowerCase() && e.verification?.status === "verified"));
  if (result.data.length !== 1 || !account) throw new Error("Exactly one existing verified account is required. Sign up and verify email first.");
  if (action === "grant") await db.insert(moderators).values({ userId: account.id }).onConflictDoNothing();
  else await db.delete(moderators).where(eq(moderators.userId, account.id));
  process.stdout.write(`Moderator access ${action === "grant" ? "granted" : "revoked"} in the current environment.\n`);
} finally { await pool.end(); }
