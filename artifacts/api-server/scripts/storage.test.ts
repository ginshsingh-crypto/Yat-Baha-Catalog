import assert from 'node:assert/strict';
import test from 'node:test';
import type { Storage } from '@google-cloud/storage';
import { ObjectNotFoundError, ObjectStorageService } from '../src/lib/objectStorage';

function fixture() {
  const calls: { bucket: string; object: string; options?: Record<string, unknown> }[] = [];
  const client = {
    bucket(bucket: string) {
      return {
        file(object: string) {
          return {
            name: object,
            async exists() { return [!object.endsWith('/missing')]; },
            async getSignedUrl(options: Record<string, unknown>) {
              calls.push({ bucket, object, options });
              return [`https://storage.googleapis.com/${bucket}/${object}?X-Goog-Signature=test`];
            },
          };
        },
      };
    },
  } as unknown as Storage;
  return { service: new ObjectStorageService(client), calls };
}

test('private uploads retain the existing API path contract and expire after 15 minutes', async () => {
  const previous = process.env.PRIVATE_OBJECT_DIR;
  process.env.PRIVATE_OBJECT_DIR = '/test-private/production/';
  try {
    const { service, calls } = fixture();
    const before = Date.now();
    const url = await service.getObjectEntityUploadURL();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.bucket, 'test-private');
    assert.match(calls[0]!.object, /^production\/uploads\/[a-f0-9-]{36}$/);
    assert.equal(calls[0]!.options?.version, 'v4');
    assert.equal(calls[0]!.options?.action, 'write');
    const expiry = calls[0]!.options?.expires as number;
    assert(expiry >= before + 900_000 && expiry <= Date.now() + 900_000);
    const normalized = service.normalizeObjectEntityPath(url);
    assert.match(normalized, /^\/objects\/uploads\/[a-f0-9-]{36}$/);
    assert(!normalized.includes('Signature'));
    const file = await service.getObjectEntityFile(normalized);
    assert.equal(file.name, calls[0]!.object);
  } finally {
    if (previous === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = previous;
  }
});

test('normalization decodes paths without admitting another private prefix', async () => {
  const previous = process.env.PRIVATE_OBJECT_DIR;
  process.env.PRIVATE_OBJECT_DIR = '/test-private/photos private';
  try {
    const { service } = fixture();
    assert.equal(service.normalizeObjectEntityPath('https://storage.googleapis.com/test-private/photos%20private/uploads/abc?X-Goog-Signature=test'), '/objects/uploads/abc');
    const outside = service.normalizeObjectEntityPath('https://storage.googleapis.com/test-private/photos%20private-other/uploads/abc?X-Goog-Signature=test');
    await assert.rejects(service.getObjectEntityFile(outside), ObjectNotFoundError);
    assert.equal(service.normalizeObjectEntityPath('/objects/sanitized/abc.jpg'), '/objects/sanitized/abc.jpg');
  } finally {
    if (previous === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = previous;
  }
});

test('invalid object references and missing objects do not resolve', async () => {
  const previous = process.env.PRIVATE_OBJECT_DIR;
  process.env.PRIVATE_OBJECT_DIR = '/test-private/production';
  try {
    const { service } = fixture();
    for (const path of ['/objects/../secret', '/objects//secret', '/objects/uploads/../secret', '/other/uploads/abc', '/objects/uploads/missing']) {
      await assert.rejects(service.getObjectEntityFile(path), ObjectNotFoundError);
    }
  } finally {
    if (previous === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = previous;
  }
});

test('a missing or malformed private storage directory fails before signing', async () => {
  const previous = process.env.PRIVATE_OBJECT_DIR;
  try {
    const { service, calls } = fixture();
    for (const value of ['', '/bucket', '/bucket/../private', '/bucket//private', '/bucket/private?key=value']) {
      process.env.PRIVATE_OBJECT_DIR = value;
      await assert.rejects(service.getObjectEntityUploadURL());
    }
    assert.equal(calls.length, 0);
  } finally {
    if (previous === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = previous;
  }
});
