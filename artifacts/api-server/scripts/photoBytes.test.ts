import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import type { File } from '@google-cloud/storage';
import { MAX_PHOTO_BYTES, readVerifiedPhoto } from '../src/lib/photoBytes';

function fileFor(size: number, chunks: Buffer[], generation: string | undefined = '123') {
  const requests: unknown[] = [];
  const stream = Readable.from(chunks);
  const file = {
    name: 'private/uploads/test',
    async getMetadata() { return [{ size: String(size), generation }]; },
    bucket: { file(name: string, options: unknown) {
      requests.push({ name, options });
      return { createReadStream(options: unknown) { requests.push(options); return stream; } };
    } },
  } as unknown as File;
  return { file, requests, stream };
}

test('downloads only the generation whose metadata was validated, with a bounded range', async () => {
  const { file, requests, stream } = fileFor(4, [Buffer.from('ab'), Buffer.from('cd')]);
  const bytes = await readVerifiedPhoto(file, 4);
  assert.equal(bytes.toString(), 'abcd');
  assert.deepEqual(requests[0], { name: 'private/uploads/test', options: { generation: '123' } });
  assert.deepEqual(requests[1], { start: 0, end: MAX_PHOTO_BYTES, validation: false, decompress: false });
  assert.equal(stream.destroyed, true);
});

test('rejects oversized or inconsistent metadata before opening a stream', async () => {
  for (const [size, declared] of [[MAX_PHOTO_BYTES + 1, MAX_PHOTO_BYTES], [10, 9], [0, 0], [NaN, 5]]) {
    const { file, requests } = fileFor(size!, []);
    await assert.rejects(readVerifiedPhoto(file, declared!), { status: 400 });
    assert.equal(requests.length, 0);
  }
  const { file, requests } = fileFor(4, [], '');
  await assert.rejects(readVerifiedPhoto(file, 4), { status: 400 });
  assert.equal(requests.length, 0);
});

test('a larger or truncated body cannot bypass the declared-size check', async () => {
  for (const chunks of [[Buffer.from('abcde')], [Buffer.from('ab')]]) {
    const { file, stream } = fileFor(4, chunks);
    await assert.rejects(readVerifiedPhoto(file, 4), { status: 400 });
    assert.equal(stream.destroyed, true);
  }
  const { file, stream } = fileFor(MAX_PHOTO_BYTES, [Buffer.alloc(MAX_PHOTO_BYTES), Buffer.from('x')]);
  await assert.rejects(readVerifiedPhoto(file, MAX_PHOTO_BYTES), { status: 400 });
  assert.equal(stream.destroyed, true);
});

test('a replaced or unavailable generation fails instead of reading the latest object', async () => {
  const error = Object.assign(new Error('Generation no longer exists'), { code: 404 });
  const file = {
    name: 'private/uploads/test',
    async getMetadata() { return [{ size: '4', generation: 'old-version' }]; },
    bucket: { file(_name: string, options: { generation: string }) {
      assert.equal(options.generation, 'old-version');
      return { createReadStream() { return new Readable({ read() { this.destroy(error); } }); } };
    } },
  } as unknown as File;
  await assert.rejects(readVerifiedPhoto(file, 4), { code: 404 });
});
