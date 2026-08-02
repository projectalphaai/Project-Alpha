import { prisma } from "./prisma.js";

export async function logActivity({ userId, postId = null, leadId = null, type, message, meta = {} }) {
  try {
    return await prisma.activityLog.create({
      data: {
        userId,
        postId: postId || null,
        leadId: leadId || null,
        type,
        message,
        metaJson: JSON.stringify(meta || {})
      }
    });
  } catch (err) {
    console.error("Activity log write failed:", err?.name || "Error");
    return null;
  }
}

export function serializeActivity(row) {
  let meta = {};
  try {
    meta = JSON.parse(row.metaJson || "{}");
  } catch {
    meta = {};
  }
  return {
    id: row.id,
    postId: row.postId || null,
    leadId: row.leadId || null,
    type: row.type,
    message: row.message,
    meta,
    createdAt: row.createdAt.toISOString()
  };
}
