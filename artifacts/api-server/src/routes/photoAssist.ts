import express, { Router, type Request, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { describePhoto, PhotoAssistBody, PhotoAssistError, sanitizeImage, visionConfigured, type PhotoSuggestion } from '../lib/photoAssist';

type Dependencies = {
  requireUser: RequestHandler;
  user: (req: Request) => string;
  configured?: () => boolean;
  describe?: (image: string) => Promise<PhotoSuggestion>;
};

export function createPhotoAssistRouter({ requireUser, user, configured = visionConfigured, describe = describePhoto }: Dependencies) {
  const router = Router();
  router.post('/assist/photo', requireUser,
    rateLimit({ windowMs: 3_600_000, limit: 6, keyGenerator: user, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'وصلت إلى حد مساعدة الصور لهذه الساعة. يمكنك إكمال الوصف يدوياً.' } }),
    rateLimit({ windowMs: 3_600_000, limit: 120, keyGenerator: () => 'vision-budget', standardHeaders: false, legacyHeaders: false, message: { error: 'مساعدة الصور مشغولة الآن. يمكنك إكمال الوصف يدوياً.' } }),
    (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); if (!configured()) { res.status(503).json({ error: 'مساعدة الصور غير مفعّلة حالياً. أكمل البلاغ يدوياً.' }); return; } next(); },
    express.json({ limit: '3mb' }),
    async (req, res, next) => {
      try {
        const body = PhotoAssistBody.safeParse(req.body);
        if (!body.success) throw new PhotoAssistError(400, 'وافق على إرسال صورة واحدة صالحة أو أكمل الوصف يدوياً.');
        const image = await sanitizeImage(body.data.image);
        const suggestion = await describe(image);
        res.json({ suggestion, notice: 'اقتراح آلي قابل للخطأ. راجع الوصف قبل استخدامه؛ لا يثبت هوية المالك.' });
      } catch (err) {
        if (err instanceof PhotoAssistError) { res.status(err.status).json({ error: err.message }); return; }
        next(err);
      }
    });
  return router;
}
