/**
 * Role-based access control.
 * Roles (ascending privilege): member < admin < owner
 */

const ROLE_RANK = {
  member: 1,
  admin: 2,
  owner: 3
};

export function normalizeRole(role) {
  const value = String(role || "member").toLowerCase();
  return ROLE_RANK[value] ? value : "member";
}

export function hasMinRole(userRole, minimumRole) {
  const userRank = ROLE_RANK[normalizeRole(userRole)] || 0;
  const minRank = ROLE_RANK[normalizeRole(minimumRole)] || 99;
  return userRank >= minRank;
}

/** Require authenticated user with at least `minimumRole`. Use after requireAuth. */
export function requireRole(minimumRole = "member") {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    if (!hasMinRole(req.user.role, minimumRole)) {
      return res.status(403).json({
        ok: false,
        error: "You do not have permission to perform this action."
      });
    }
    return next();
  };
}
