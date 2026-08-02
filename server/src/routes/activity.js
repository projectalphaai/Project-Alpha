import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { serializeActivity } from "../lib/activity.js";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const rows = await prisma.activityLog.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take
    });
    return res.json({ ok: true, activity: rows.map(serializeActivity) });
  } catch (err) {
    next(err);
  }
});

export default router;
