import { db, accountDeletions } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockAccount(tx: Transaction, userId: string) {
  // Separate lock namespace from any other feature. The database lock spans
  // processes and instances; a hash collision only serializes unrelated users.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('yat-biha-account'), hashtext(${userId}))`);
}

export async function assertAccountActive(userId: string, connection: Transaction | typeof db = db) {
  const [deletion] = await connection.select({ id: accountDeletions.userId }).from(accountDeletions).where(eq(accountDeletions.userId, userId));
  if (deletion) throw Object.assign(new Error('بدأ حذف هذا الحساب. يمكنك إعادة محاولة الحذف لإكماله.'), { status: 409 });
}

export function withAccountMutation<T>(userId: string, operation: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await lockAccount(tx, userId);
    await assertAccountActive(userId, tx);
    return operation(tx);
  });
}
