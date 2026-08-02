import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  clearSessionCookie,
  optionalAuth,
  requireAuth,
  setSessionCookie,
  signSession
} from "../middleware/auth.js";

const router = Router();

const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  email: z.string().trim().email("Enter a valid email address.").max(120),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128)
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(120),
  password: z.string().min(1, "Enter your password.").max(128)
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  company: z.string().trim().max(80).optional().default(""),
  timezone: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128).optional().or(z.literal(""))
});

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company || "",
    timezone: user.timezone || "UTC",
    createdAt: user.createdAt || undefined
  };
}

function issueAuth(res, user) {
  const token = signSession(user);
  setSessionCookie(res, token);
  return { token, user: publicUser(user) };
}

router.get("/me", optionalAuth, (req, res) => {
  if (!req.user) {
    return res.json({ ok: true, loggedIn: false, user: null });
  }
  return res.json({ ok: true, loggedIn: true, user: publicUser(req.user) });
});

router.post("/signup", async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid input."
      });
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ ok: false, error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash
      }
    });

    const auth = issueAuth(res, user);
    return res.status(201).json({ ok: true, ...auth });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Enter a valid email and password." });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    const auth = issueAuth(res, user);
    return res.json({ ok: true, ...auth });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

router.get("/protected", requireAuth, (req, res) => {
  return res.json({
    ok: true,
    message: "Protected route access granted.",
    user: publicUser(req.user)
  });
});

router.put("/profile", requireAuth, async (req, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid profile data."
      });
    }

    const email = parsed.data.email.toLowerCase();
    const emailTaken = await prisma.user.findFirst({
      where: { email, NOT: { id: req.user.id } }
    });
    if (emailTaken) {
      return res.status(409).json({ ok: false, error: "Another account already uses this email." });
    }

    const data = {
      name: parsed.data.name,
      email,
      company: parsed.data.company || "",
      timezone: parsed.data.timezone
    };

    if (parsed.data.password) {
      data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data
    });

    const auth = issueAuth(res, user);
    return res.json({ ok: true, ...auth });
  } catch (err) {
    next(err);
  }
});

export default router;
