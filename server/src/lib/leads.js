export const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];

export const LEAD_STAGE_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost"
};

export function parseTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        return parseTags(JSON.parse(trimmed));
      } catch {
        /* fall through to csv parse */
      }
    }
    return [
      ...new Set(
        trimmed
          .split(/[,#]/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      )
    ].slice(0, 20);
  }
  return [];
}

export function parseSocialLinks(value) {
  const base = {
    website: "",
    linkedin: "",
    instagram: "",
    x: "",
    facebook: ""
  };
  let incoming = value;
  if (typeof value === "string") {
    try {
      incoming = JSON.parse(value || "{}");
    } catch {
      incoming = {};
    }
  }
  if (!incoming || typeof incoming !== "object") return base;
  for (const key of Object.keys(base)) {
    if (incoming[key] != null) base[key] = String(incoming[key]).trim().slice(0, 300);
  }
  return base;
}

export function serializeLead(lead, { includeDetails = false } = {}) {
  let tags = [];
  let socialLinks = parseSocialLinks(lead.socialLinksJson);
  try {
    tags = JSON.parse(lead.tagsJson || "[]");
  } catch {
    tags = [];
  }
  if (!Array.isArray(tags)) tags = [];

  const base = {
    id: lead.id,
    name: lead.name,
    email: lead.email || "",
    phone: lead.phone || "",
    company: lead.company || "",
    stage: lead.stage,
    stageLabel: LEAD_STAGE_LABELS[lead.stage] || lead.stage,
    tags,
    socialLinks,
    followUpAt: lead.followUpAt ? lead.followUpAt.toISOString() : null,
    position: lead.position ?? 0,
    ownerId: lead.ownerId || null,
    ownerName: lead.owner?.name || null,
    ownerEmail: lead.owner?.email || null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString()
  };

  if (includeDetails) {
    base.notes = (lead.notes || []).map((n) => ({
      id: n.id,
      body: n.body,
      userId: n.userId,
      authorName: n.user?.name || "",
      createdAt: n.createdAt.toISOString()
    }));
    base.statusHistory = (lead.statusHistory || []).map((h) => ({
      id: h.id,
      fromStage: h.fromStage,
      toStage: h.toStage,
      note: h.note || "",
      createdAt: h.createdAt.toISOString()
    }));
  }

  return base;
}
