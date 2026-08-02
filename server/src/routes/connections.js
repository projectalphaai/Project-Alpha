import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const PLATFORMS = ["instagram", "facebook", "linkedin", "x", "youtube"];
const REAL_OAUTH = new Set(["instagram", "facebook"]);

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const rows = await prisma.connectedAccount.findMany({
      where: { userId: req.user.id },
      orderBy: { connectedAt: "desc" }
    });

    const byPlatform = {};
    for (const platform of PLATFORMS) {
      const match = rows.find((r) => r.platform === platform);
      byPlatform[platform] = {
        platform,
        supported: REAL_OAUTH.has(platform),
        connected: Boolean(match),
        accountId: match?.accountId || null,
        accountName: match?.accountName || null,
        accountUsername: match?.accountUsername || null,
        connectedAt: match?.connectedAt || null
      };
    }

    return res.json({
      ok: true,
      connections: byPlatform,
      connectedCount: rows.length
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:platform", requireAuth, async (req, res, next) => {
  try {
    const platform = String(req.params.platform || "").toLowerCase();
    if (!REAL_OAUTH.has(platform)) {
      return res.status(400).json({
        ok: false,
        error: "Only Instagram and Facebook connections can be managed in Sprint 1."
      });
    }

    await prisma.connectedAccount.deleteMany({
      where: { userId: req.user.id, platform }
    });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
