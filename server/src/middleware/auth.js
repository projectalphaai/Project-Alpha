import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";

export function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: `${config.sessionTtlDays}d` }
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

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, error: "Session expired. Please log in again." });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        timezone: true,
        createdAt: true
      }
    });

    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, error: "Account not found." });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) return next();
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        timezone: true,
        createdAt: true
      }
    });
    if (user) req.user = user;
    next();
  } catch {
    next();
  }
}
