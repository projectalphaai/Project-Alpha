import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";

const userSelect = {
  id: true,
  email: true,
  name: true,
  company: true,
  timezone: true,
  role: true,
  createdAt: true
};

export function signSession(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role || "owner"
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn,
      issuer: "project-alpha",
      audience: "project-alpha-api"
    }
  );
}

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/"
  });
}

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return req.cookies?.[config.cookieName] || null;
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    issuer: "project-alpha",
    audience: "project-alpha-api"
  });
}

async function loadUser(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: userSelect
  });
}

export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, error: "Session expired. Please log in again." });
    }

    const user = await loadUser(payload.sub);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, error: "Account not found." });
    }

    req.user = user;
    req.authToken = token;
    return next();
  } catch (err) {
    return next(err);
  }
}

export async function optionalAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) return next();

    try {
      const payload = verifyToken(token);
      const user = await loadUser(payload.sub);
      if (user) {
        req.user = user;
        req.authToken = token;
      }
    } catch {
      /* ignore invalid optional auth */
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
