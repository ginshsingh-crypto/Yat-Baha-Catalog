export interface PhotoSuggestion { title: string; category: string; description: string; color: string }

/** Explicit token-authenticated request; API keys never enter the app bundle. */
export async function requestPhotoSuggestion(image: string, token: string | null, signal?: AbortSignal): Promise<PhotoSuggestion> {
  if (!token) throw new Error('سجّل الدخول لاستخدام مساعدة الصور.');
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (!host || !/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host)) throw new Error('مساعدة الصور غير مفعّلة حالياً. أكمل البلاغ يدوياً.');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 2_666_732) throw new Error('اختر صورة JPEG أو PNG أو WebP أصغر من ٢ م.ب.');
  const response = await fetch(`https://${host}/api/assist/photo`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, consent: true }), signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'تعذّر تحليل الصورة الآن. أكمل الوصف يدوياً.');
  const s = body?.suggestion;
  if (!s || typeof s.title !== 'string' || typeof s.category !== 'string' || typeof s.description !== 'string' || typeof s.color !== 'string') throw new Error('تعذّر قراءة اقتراح الصورة.');
  return s;
}
