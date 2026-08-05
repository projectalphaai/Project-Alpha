import { prisma } from "../prisma.js";
import { config } from "../../config.js";

export const PRIORITIES = ["low", "normal", "high", "urgent"];

const PRIORITY_WEIGHTS = { urgent: 3, high: 2, normal: 1, low: 0 };

export function priorityWeight(priority) {
  return PRIORITY_WEIGHTS[priority] ?? PRIORITY_WEIGHTS.normal;
}

const ACTIVE_STATUSES = ["scheduled", "processing"];

/**
 * "Never publish two posts together" — reject two non-cancelled posts on the
 * same platform inside the configured minimum spacing window, unless the
 * caller explicitly forces it. Returns the conflicting post (or null).
 */
export async function findSpacingConflict({ userId, platform, scheduledAt, excludePostId = null }) {
  const spacingMs = config.scheduler.minPostSpacingMinutes * 60 * 1000;
  if (spacingMs <= 0) return null;

  const windowStart = new Date(scheduledAt.getTime() - spacingMs);
  const windowEnd = new Date(scheduledAt.getTime() + spacingMs);

  const conflict = await prisma.scheduledPost.findFirst({
    where: {
      userId,
      platform,
      status: { in: ACTIVE_STATUSES },
      scheduledAt: { gte: windowStart, lte: windowEnd },
      ...(excludePostId ? { id: { not: excludePostId } } : {})
    },
    orderBy: { scheduledAt: "asc" }
  });

  return conflict || null;
}

export function spacingErrorMessage(conflict) {
  const when = conflict.scheduledAt.toISOString();
  return `Too close to another ${conflict.platform} post scheduled at ${when}. Minimum spacing is ${config.scheduler.minPostSpacingMinutes} minute(s). Pass force:true to override.`;
}
