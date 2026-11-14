import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
const pause = () => new Promise((done) => setTimeout(done, 50));

// Deliberately never use DATABASE_URL as the opt-in: the test is not allowed
// to connect to a configured application database merely because it exists.
test('PostgreSQL deletion and photo concurrency', { skip: !process.env.TEST_DATABASE_URL, timeout: 60_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Never run database tests in production');
  const schema = `yatbiha_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.searchParams.set('options', `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=5000`);
  const previousDatabase = process.env.DATABASE_URL;
  const previousDirectory = process.env.PRIVATE_OBJECT_DIR;
  process.env.DATABASE_URL = url.toString();
  process.env.PRIVATE_OBJECT_DIR = '/test-private/production';
  const { db, pool, reports, photos, accountDeletions, photoDeletions } = await import('@workspace/db');
  const { lockAccount, withAccountMutation } = await import('../src/lib/mutations');
  const { preparePhoto, removePhoto, purgePreparedPhotoRaw } = await import('../src/lib/photos');
  const { cleanupPhotos } = await import('../src/lib/photoCleanup');
  const { objectStorageClient } = await import('../src/lib/objectStorage');
  const sharp = (await import('sharp')).default;

  const objects = new Map<string, Buffer>();
  let deleteGate: { name: string; entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  const originalBucket = objectStorageClient.bucket;
  const fakeBucket = {
    file(name: string) {
      return {
        name,
        bucket: fakeBucket,
        async exists() { return [objects.has(name)]; },
        async getMetadata() { return [{ size: String(objects.get(name)?.length ?? 0), generation: '1' }]; },
        createReadStream(options: { start?: number; end?: number }) {
          const bytes = objects.get(name);
          if (!bytes) return new Readable({ read() { this.destroy(new Error('Missing object')); } });
          return Readable.from([bytes.subarray(options.start ?? 0, (options.end ?? bytes.length - 1) + 1)]);
        },
        async save(bytes: Buffer) { objects.set(name, Buffer.from(bytes)); },
        async delete() {
          if (deleteGate?.name === name) { deleteGate.entered.resolve(); await deleteGate.release.promise; }
          objects.delete(name);
        },
      };
    },
  };
  objectStorageClient.bucket = (() => fakeBucket) as typeof objectStorageClient.bucket;
  const report = (id: string, ownerId: string, photoId?: string) => ({ id, ownerId, type: 'found', title: 'Test wallet', category: 'wallet', description: 'Test only', city: 'الرياض', place: 'Test park', date: '2026-01-01', photoId });
  const seedPhoto = async (id: string, clean: boolean) => {
    const raw = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'red' } }).jpeg().toBuffer();
    objects.set(`production/uploads/${id}`, raw);
    if (clean) objects.set(`production/sanitized/${id}.jpg`, raw);
    await db.insert(photos).values({ id, ownerId: 'photo-owner', rawPath: `/objects/uploads/${id}`, cleanPath: clean ? `/objects/sanitized/${id}.jpg` : null, size: raw.length, createdAt: new Date(Date.now() - 2 * 86400000) });
  };
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`
      CREATE TABLE reports (
        id text PRIMARY KEY, owner_id text NOT NULL, type text NOT NULL, title text NOT NULL,
        category text NOT NULL, description text NOT NULL, city text NOT NULL, place text NOT NULL,
        date text NOT NULL, photo_id text UNIQUE, status text NOT NULL DEFAULT 'open',
        hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE photos (
        id text PRIMARY KEY, owner_id text NOT NULL, raw_path text NOT NULL, clean_path text,
        size integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const migration = await readFile(new URL('../../../lib/db/migrations/0001_account_deletion_guard.sql', import.meta.url), 'utf8');
    await pool.query(migration);

    await t.test('deletion waits for earlier mutations and blocks later mutations', async () => {
      const entered = deferred(), release = deferred();
      let deletionFinished = false;
      const first = withAccountMutation('delete-me', async (tx) => {
        await tx.insert(reports).values(report('before-deletion', 'delete-me'));
        entered.resolve();
        await release.promise;
      });
      await entered.promise;
      const deletion = db.transaction(async (tx) => {
        await lockAccount(tx, 'delete-me');
        await tx.insert(accountDeletions).values({ userId: 'delete-me' });
        await tx.delete(reports).where(eq(reports.ownerId, 'delete-me'));
      }).then(() => { deletionFinished = true; });
      try { await pause(); assert.equal(deletionFinished, false); }
      finally { release.resolve(); await Promise.all([first, deletion]); }
      await assert.rejects(withAccountMutation('delete-me', async (tx) => tx.insert(reports).values(report('after-deletion', 'delete-me'))), { status: 409 });
      assert.equal((await db.select().from(reports).where(eq(reports.ownerId, 'delete-me'))).length, 0);
    });

    await t.test('a mutation waiting behind an uncommitted deletion sees the deletion marker', async () => {
      const entered = deferred(), release = deferred();
      const deletion = db.transaction(async (tx) => {
        await lockAccount(tx, 'delete-first');
        await tx.insert(accountDeletions).values({ userId: 'delete-first' });
        entered.resolve(); await release.promise;
      });
      await entered.promise;
      let ran = false;
      const write = withAccountMutation('delete-first', async () => { ran = true; }).then(() => null, (err) => err);
      try { await pause(); assert.equal(ran, false); }
      finally { release.resolve(); await deletion; }
      assert.equal((await write).status, 409);
      assert.equal(ran, false);
    });

    await t.test('cleanup rechecks attachment after waiting for the photo lock', async () => {
      await seedPhoto('attach-first', true);
      const entered = deferred(), release = deferred();
      const attach = withAccountMutation('photo-owner', async (tx) => {
        await preparePhoto('attach-first', 'photo-owner', tx);
        entered.resolve(); await release.promise;
        await tx.insert(reports).values(report('attached-report', 'photo-owner', 'attach-first'));
      });
      await entered.promise;
      let cleaned = false;
      const cleanup = removePhoto('attach-first', true).then(() => { cleaned = true; });
      try { await pause(); assert.equal(cleaned, false); }
      finally { release.resolve(); await Promise.all([attach, cleanup]); }
      assert.equal((await db.select().from(photos).where(eq(photos.id, 'attach-first'))).length, 1);
      assert(objects.has('production/sanitized/attach-first.jpg'));
    });

    await t.test('an attachment cannot publish a dangling photo after cleanup wins', async () => {
      await seedPhoto('cleanup-first', true);
      const entered = deferred(), release = deferred();
      deleteGate = { name: 'production/sanitized/cleanup-first.jpg', entered, release };
      const cleanup = removePhoto('cleanup-first', true);
      await entered.promise;
      const attach = withAccountMutation('photo-owner', async (tx) => {
        await preparePhoto('cleanup-first', 'photo-owner', tx);
        await tx.insert(reports).values(report('must-not-exist', 'photo-owner', 'cleanup-first'));
      }).then(() => null, (err) => err);
      release.resolve();
      await cleanup;
      assert.equal((await attach).status, 403);
      assert.equal((await db.select().from(reports).where(eq(reports.id, 'must-not-exist'))).length, 0);
      deleteGate = undefined;
    });

    await t.test('failed attachment retains raw bytes for retry and purges them only after commit', async () => {
      await seedPhoto('retry-photo', false);
      await assert.rejects(withAccountMutation('photo-owner', async (tx) => {
        await preparePhoto('retry-photo', 'photo-owner', tx);
        throw new Error('Simulated report failure');
      }), /Simulated report failure/);
      assert(objects.has('production/uploads/retry-photo'));
      assert.equal((await db.select().from(photos).where(eq(photos.id, 'retry-photo')))[0]!.cleanPath, null);
      await withAccountMutation('photo-owner', async (tx) => {
        await preparePhoto('retry-photo', 'photo-owner', tx);
        await tx.insert(reports).values(report('retry-report', 'photo-owner', 'retry-photo'));
      });
      await purgePreparedPhotoRaw('retry-photo');
      assert(!objects.has('production/uploads/retry-photo'));
      assert(objects.has('production/sanitized/retry-photo.jpg'));
      assert((await db.select().from(photos).where(eq(photos.id, 'retry-photo')))[0]!.rawPurgedAt);
    });

    await t.test('an upload recreated after deletion stays tracked until its signed URL expires', async () => {
      await seedPhoto('recent-deletion', true);
      const createdAt = new Date();
      await db.update(photos).set({ createdAt }).where(eq(photos.id, 'recent-deletion'));
      await removePhoto('recent-deletion', true);
      const [pending] = await db.select().from(photoDeletions).where(eq(photoDeletions.photoId, 'recent-deletion'));
      assert(pending);
      assert.equal(+pending.notBefore, +createdAt + 20 * 60_000);
      assert.equal((await db.select().from(photos).where(eq(photos.id, 'recent-deletion'))).length, 0);
      objects.set('production/uploads/recent-deletion', Buffer.from('recreated using still-valid URL'));
      await cleanupPhotos();
      assert(objects.has('production/uploads/recent-deletion'));
      assert.equal((await db.select().from(photoDeletions).where(eq(photoDeletions.photoId, 'recent-deletion'))).length, 1);
      await db.update(photoDeletions).set({ notBefore: new Date(Date.now() - 1000) }).where(eq(photoDeletions.photoId, 'recent-deletion'));
      await cleanupPhotos();
      assert(!objects.has('production/uploads/recent-deletion'));
      assert.equal((await db.select().from(photoDeletions).where(eq(photoDeletions.photoId, 'recent-deletion'))).length, 0);
    });
  } finally {
    deleteGate?.release.resolve();
    objectStorageClient.bucket = originalBucket;
    try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await pool.end(); }
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
    if (previousDirectory === undefined) delete process.env.PRIVATE_OBJECT_DIR; else process.env.PRIVATE_OBJECT_DIR = previousDirectory;
  }
});
