import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reportsRouter from "./reports";
import claimsRouter from "./claims";
import { rateLimit } from "express-rate-limit";
import { identity, requireUser, user } from "../lib/community";
import { createPhotoAssistRouter } from "./photoAssist";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
}));
router.use(rateLimit({
  windowMs: 60_000,
  limit: 20,
  skip: (req) => req.method === "GET" || !identity(req),
  keyGenerator: (req) => identity(req) ?? "anonymous",
  message: { error: "طلبات كثيرة. انتظر دقيقة ثم حاول مجدداً." },
}));
router.use(createPhotoAssistRouter({ requireUser, user }));
router.use(reportsRouter);
router.use(claimsRouter);

export default router;
