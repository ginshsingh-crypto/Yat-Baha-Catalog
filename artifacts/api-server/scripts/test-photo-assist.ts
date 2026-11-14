import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import sharp from 'sharp';
import { createPhotoAssistRouter } from '../src/routes/photoAssist';
import { describePhoto, MAX_IMAGE_BYTES, PhotoAssistError, sanitizeImage, suggestionFromDescriptors, visionConfigured } from '../src/lib/photoAssist';

const valid = { category: 'wallet', color: 'brown', recognizable: true, privateContent: false };
const env = { OPENAI_API_KEY: 'unit-test-placeholder', OPENAI_VISION_MODEL: 'configured-vision-model' };
const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: 'brown' } }).png().withMetadata().toBuffer();
const dataUri = `data:image/png;base64,${png.toString('base64')}`;
const clean = await sanitizeImage(dataUri);
assert(clean.startsWith('data:image/jpeg;base64,'));
const meta = await sharp(Buffer.from(clean.split(',')[1]!, 'base64')).metadata();
assert.equal(meta.exif, undefined);
assert.equal(meta.format, 'jpeg');
for (const image of ['https://example.com/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA', dataUri.replace('png', 'jpeg'), `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64')}`]) {
  await assert.rejects(() => sanitizeImage(image), (err: unknown) => err instanceof PhotoAssistError && err.status === 400);
}
assert.equal(visionConfigured({}), false);
assert.equal(visionConfigured({ ...env, OPENAI_VISION_MODEL: 'bad model' }), false);
assert.equal(visionConfigured(env), true);
assert.equal(suggestionFromDescriptors(valid).category, 'wallet');
assert(suggestionFromDescriptors(valid).description.includes('بني'));
for (const data of [{ ...valid, title: 'ID 1234567890' }, { ...valid, color: '1234567890' }, { ...valid, privateContent: true }, { ...valid, recognizable: false }, { ...valid, category: 'docs' }]) {
  assert.throws(() => suggestionFromDescriptors(data), PhotoAssistError);
}
let sent = 0;
let captured: Record<string, any> = {};
const request = (async (url: string | URL | Request, options?: RequestInit) => {
  sent++;
  assert.equal(url, 'https://api.openai.com/v1/responses');
  captured = JSON.parse(String(options?.body));
  return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(valid) }] }] }), { status: 200 });
}) as typeof fetch;
assert.equal((await describePhoto(clean, { env, request })).category, 'wallet');
assert.equal(captured.store, false);
assert.equal(captured.text.format.strict, true);
assert.equal(captured.input[0].content[1].image_url, clean);
await assert.rejects(() => describePhoto(clean, { env: {}, request }), PhotoAssistError);
assert.equal(sent, 1);
for (const payload of [{ status: 'incomplete', output: [] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }, { status: 'completed', output: {} }, { status: 'completed', output: [null] }]) {
  await assert.rejects(() => describePhoto(clean, { env, request: (async () => new Response(JSON.stringify(payload))) as typeof fetch }), PhotoAssistError);
}
await assert.rejects(() => describePhoto(clean, { env, request: (async () => new Response('sensitive-provider-diagnostic', { status: 500 })) as typeof fetch }), (err: unknown) => err instanceof PhotoAssistError && !err.message.includes('diagnostic'));
await assert.rejects(() => describePhoto(clean, { env, request: (async () => new Response('x'.repeat(40_000))) as typeof fetch }), PhotoAssistError);

let providerCalls = 0;
let configured = true;
const app = express();
app.use('/api', createPhotoAssistRouter({
  requireUser: (req, res, next) => { if (!req.get('authorization')?.startsWith('Bearer test-')) { res.status(401).json({ error: 'Sign in' }); return; } next(); },
  user: (req) => req.get('authorization')!,
  configured: () => configured,
  describe: async (image) => { providerCalls++; assert(image.startsWith('data:image/jpeg;base64,')); return suggestionFromDescriptors(valid); },
}));
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(err.status ?? 500).json({ error: 'Request failed' }));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const addr = server.address();
assert(addr && typeof addr === 'object');
const url = `http://127.0.0.1:${addr.port}/api/assist/photo`;
async function post(user: string | null, body: unknown) {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer test-${user}` } : {}) }, body: JSON.stringify(body) });
}
try {
  assert.equal((await post(null, { image: 'x'.repeat(3_200_000), consent: true })).status, 401);
  assert.equal(providerCalls, 0);
  configured = false;
  assert.equal((await post('disabled', { image: dataUri, consent: true })).status, 503);
  assert.equal(providerCalls, 0);
  configured = true;
  assert.equal((await post('missing-consent', { image: dataUri, consent: false })).status, 400);
  assert.equal((await post('unknown-field', { image: dataUri, consent: true, userId: 'other-person' })).status, 400);
  assert.equal((await post('url', { image: 'http://localhost/private', consent: true })).status, 400);
  assert.equal((await post('oversize', { image: 'x'.repeat(3_200_000), consent: true })).status, 413);
  assert.equal(providerCalls, 0);
  const okay = await post('normal', { image: dataUri, consent: true });
  assert.equal(okay.status, 200);
  assert.equal(okay.headers.get('cache-control'), 'no-store');
  assert.equal((await okay.json()).suggestion.category, 'wallet');
  for (let i = 0; i < 6; i++) assert.equal((await post('limited', { image: dataUri, consent: true })).status, 200);
  assert.equal((await post('limited', { image: dataUri, consent: true })).status, 429);
  assert.equal(providerCalls, 7);
  assert.equal((await post('different-user', { image: dataUri, consent: true })).status, 200);
  console.log('PASS: photo assistance input bounds, image decode/metadata removal, enum-only output, consent, auth-before-body, disabled-provider handling, safe errors, per-user rate limits and fixed provider request.');
} finally { server.close(); await once(server, 'close'); }
