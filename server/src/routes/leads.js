import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { logActivity } from "../lib/activity.js";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  parseSocialLinks,
  parseTags,
  serializeLead
} from "../lib/leads.js";

const router = Router();

const leadBodySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email.")
    .optional()
    .default(""),
  phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(120).optional().default(""),
  stage: z.enum(LEAD_STAGES).optional().default("new"),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  socialLinks: z.record(z.string()).optional(),
  followUpAt: z
    .union([z.string().datetime({ offset: true }), z.literal(""), z.null()])
    .optional(),
  ownerId: z.union([z.string().cuid(), z.null()]).optional(),
  position: z.number().int().min(0).max(100000).optional()
});

const stageSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  position: z.number().int().min(0).max(100000).optional(),
  note: z.string().trim().max(500).optional().default("")
});

const noteSchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty.").max(4000)
});

function parseFollowUp(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function getOwnedLead(userId, id) {
  return prisma.lead.findFirst({
    where: { id, userId },
    include: {
      owner: { select: { id: true, name: true, email: true } }
    }
  });
}

async function recordStageChange({ leadId, userId, fromStage, toStage, note = "" }) {
  if (fromStage === toStage) return;
  await prisma.leadStatusHistory.create({
    data: {
      leadId,
      userId,
      fromStage,
      toStage,
      note: note || ""
    }
  });
}

router.get("/stats", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const rows = await prisma.lead.groupBy({
      by: ["stage"],
      where: { userId: req.user.id },
      _count: { _all: true }
    });
    const byStage = Object.fromEntries(LEAD_STAGES.map((s) => [s, 0]));
    for (const row of rows) {
      if (byStage[row.stage] != null) byStage[row.stage] = row._count._all;
    }
    const total = Object.values(byStage).reduce((a, b) => a + b, 0);
    const followUpsDue = await prisma.lead.count({
      where: {
        userId: req.user.id,
        followUpAt: { lte: new Date() },
        stage: { notIn: ["won", "lost"] }
      }
    });
    return res.json({
      ok: true,
      total,
      byStage,
      followUpsDue,
      open: total - byStage.won - byStage.lost
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const stage = String(req.query.stage || "").trim();
    const tag = String(req.query.tag || "").trim().toLowerCase();
    const ownerId = String(req.query.ownerId || "").trim();
    const followUp = String(req.query.followUp || "").trim(); // due | upcoming | none

    const where = { userId: req.user.id };
    if (stage) {
      if (!LEAD_STAGES.includes(stage)) {
        return res.status(400).json({ ok: false, error: "Invalid stage filter." });
      }
      where.stage = stage;
    }
    if (ownerId) where.ownerId = ownerId;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } }
      ];
    }
    if (followUp === "due") {
      where.followUpAt = { lte: new Date() };
      where.stage = where.stage || { notIn: ["won", "lost"] };
    } else if (followUp === "upcoming") {
      where.followUpAt = { gt: new Date() };
    } else if (followUp === "none") {
      where.followUpAt = null;
    }

    let leads = await prisma.lead.findMany({
      where,
      include: { owner: { select: { id: true, name: true, email: true } } },
      orderBy: [{ stage: "asc" }, { position: "asc" }, { updatedAt: "desc" }]
    });

    if (tag) {
      leads = leads.filter((l) => {
        try {
          const tags = JSON.parse(l.tagsJson || "[]");
          return Array.isArray(tags) && tags.includes(tag);
        } catch {
          return false;
        }
      });
    }

    const counts = Object.fromEntries(LEAD_STAGES.map((s) => [s, 0]));
    for (const lead of leads) {
      if (counts[lead.stage] != null) counts[lead.stage] += 1;
    }

    return res.json({
      ok: true,
      leads: leads.map((l) => serializeLead(l)),
      counts,
      stages: LEAD_STAGES.map((s) => ({ id: s, label: LEAD_STAGE_LABELS[s] }))
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        notes: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 100
        },
        statusHistory: { orderBy: { createdAt: "desc" }, take: 100 }
      }
    });
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found." });
    return res.json({ ok: true, lead: serializeLead(lead, { includeDetails: true }) });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const parsed = leadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid lead."
      });
    }

    const data = parsed.data;
    const tags = parseTags(data.tags);
    const socialLinks = parseSocialLinks(data.socialLinks);
    const followUpAt = parseFollowUp(data.followUpAt);
    const stage = data.stage || "new";
    const ownerId = data.ownerId || req.user.id;

    const maxPos = await prisma.lead.aggregate({
      where: { userId: req.user.id, stage },
      _max: { position: true }
    });

    const lead = await prisma.lead.create({
      data: {
        userId: req.user.id,
        ownerId,
        name: data.name,
        email: data.email || "",
        phone: data.phone || "",
        company: data.company || "",
        stage,
        tagsJson: JSON.stringify(tags),
        socialLinksJson: JSON.stringify(socialLinks),
        followUpAt,
        position: data.position ?? (maxPos._max.position ?? -1) + 1
      },
      include: { owner: { select: { id: true, name: true, email: true } } }
    });

    await recordStageChange({
      leadId: lead.id,
      userId: req.user.id,
      fromStage: "",
      toStage: stage,
      note: "Lead created"
    });

    await logActivity({
      userId: req.user.id,
      leadId: lead.id,
      type: "lead_create",
      message: `Created lead ${lead.name}`,
      meta: { stage: lead.stage, email: lead.email }
    });

    return res.status(201).json({ ok: true, lead: serializeLead(lead) });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const existing = await getOwnedLead(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Lead not found." });

    const parsed = leadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid lead."
      });
    }

    const data = parsed.data;
    const nextStage = data.stage || existing.stage;
    const tags =
      data.tags === undefined ? parseTags(existing.tagsJson) : parseTags(data.tags);
    const socialLinks =
      data.socialLinks === undefined
        ? parseSocialLinks(existing.socialLinksJson)
        : parseSocialLinks(data.socialLinks);

    const lead = await prisma.lead.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        email: data.email || "",
        phone: data.phone || "",
        company: data.company || "",
        stage: nextStage,
        tagsJson: JSON.stringify(tags),
        socialLinksJson: JSON.stringify(socialLinks),
        followUpAt: parseFollowUp(data.followUpAt),
        ownerId: data.ownerId === undefined ? existing.ownerId : data.ownerId || req.user.id,
        position: data.position ?? existing.position
      },
      include: { owner: { select: { id: true, name: true, email: true } } }
    });

    if (existing.stage !== nextStage) {
      await recordStageChange({
        leadId: lead.id,
        userId: req.user.id,
        fromStage: existing.stage,
        toStage: nextStage,
        note: "Updated via edit"
      });
    }

    await logActivity({
      userId: req.user.id,
      leadId: lead.id,
      type: "lead_update",
      message: `Updated lead ${lead.name}`,
      meta: { stage: lead.stage }
    });

    return res.json({ ok: true, lead: serializeLead(lead) });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/stage", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const existing = await getOwnedLead(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Lead not found." });

    const parsed = stageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid stage update."
      });
    }

    const { stage, position, note } = parsed.data;
    const lead = await prisma.lead.update({
      where: { id: existing.id },
      data: {
        stage,
        position: position ?? existing.position
      },
      include: { owner: { select: { id: true, name: true, email: true } } }
    });

    await recordStageChange({
      leadId: lead.id,
      userId: req.user.id,
      fromStage: existing.stage,
      toStage: stage,
      note: note || "Stage moved"
    });

    await logActivity({
      userId: req.user.id,
      leadId: lead.id,
      type: "lead_stage",
      message: `Moved ${lead.name} to ${LEAD_STAGE_LABELS[stage]}`,
      meta: { fromStage: existing.stage, toStage: stage }
    });

    return res.json({ ok: true, lead: serializeLead(lead) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/notes", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const existing = await getOwnedLead(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Lead not found." });

    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid note."
      });
    }

    const note = await prisma.leadNote.create({
      data: {
        leadId: existing.id,
        userId: req.user.id,
        body: parsed.data.body
      },
      include: { user: { select: { id: true, name: true } } }
    });

    await logActivity({
      userId: req.user.id,
      leadId: existing.id,
      type: "lead_note",
      message: `Added note on ${existing.name}`,
      meta: { noteId: note.id }
    });

    return res.status(201).json({
      ok: true,
      note: {
        id: note.id,
        body: note.body,
        userId: note.userId,
        authorName: note.user?.name || "",
        createdAt: note.createdAt.toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/timeline", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const existing = await getOwnedLead(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Lead not found." });

    const [notes, history, activity] = await Promise.all([
      prisma.leadNote.findMany({
        where: { leadId: existing.id },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      prisma.leadStatusHistory.findMany({
        where: { leadId: existing.id },
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      prisma.activityLog.findMany({
        where: { leadId: existing.id },
        orderBy: { createdAt: "desc" },
        take: 50
      })
    ]);

    const timeline = [
      ...notes.map((n) => ({
        id: `note_${n.id}`,
        kind: "note",
        message: n.body,
        meta: { authorName: n.user?.name || "" },
        createdAt: n.createdAt.toISOString()
      })),
      ...history.map((h) => ({
        id: `hist_${h.id}`,
        kind: "stage",
        message: h.fromStage
          ? `${LEAD_STAGE_LABELS[h.fromStage] || h.fromStage} → ${LEAD_STAGE_LABELS[h.toStage] || h.toStage}`
          : `Created as ${LEAD_STAGE_LABELS[h.toStage] || h.toStage}`,
        meta: { note: h.note || "" },
        createdAt: h.createdAt.toISOString()
      })),
      ...activity.map((a) => ({
        id: `act_${a.id}`,
        kind: a.type,
        message: a.message,
        meta: {},
        createdAt: a.createdAt.toISOString()
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ ok: true, timeline });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const existing = await getOwnedLead(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Lead not found." });

    await prisma.lead.delete({ where: { id: existing.id } });
    await logActivity({
      userId: req.user.id,
      type: "lead_delete",
      message: `Deleted lead ${existing.name}`,
      meta: { deletedLeadId: existing.id, stage: existing.stage }
    });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
