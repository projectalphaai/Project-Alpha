import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import {
  clearSessionCookie,
  optionalAuth,
  requireAuth,
  setSessionCookie,
  signSession
} from "../middleware/auth.js";
import { createToken, hashToken, sendEmail } from "../lib/mailer.js";
import { serializeBilling } from "../lib/entitlements.js";

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

const onboardingSchema = z.object({
  workspaceName: z.string().trim().min(2, "Workspace name is required.").max(80),
  company: z.string().trim().max(80).optional().default(""),
  timezone: z.string().trim().min(1).max(80).optional().default("UTC")
});

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company || "",
    workspaceName: user.workspaceName || "",
    timezone: user.timezone || "UTC",
    role: user.role || "owner",
    emailVerified: Boolean(user.emailVerifiedAt),
    onboardingComplete: Boolean(user.onboardingComplete),
    billing: serializeBilling(user),
    createdAt: user.createdAt || undefined
  };
}

function issueAuth(res, user) {
  const token = signSession(user);
  setSessionCookie(res, token);
  return { token, user: publicUser(user) };
}

async function sendVerifyEmail(user, rawToken) {
  const link = `${config.appUrl}/pages/verify-email.html?token=${encodeURIComponent(rawToken)}`;
  await sendEmail({
    to: user.email,
    subject: "Verify your Project Alpha email",
    text: `Hi ${user.name},\n\nVerify your email:\n${link}\n\nThis link expires in 24 hours.`
  });
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

    const rawVerify = createToken();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        workspaceName: "",
        onboardingComplete: false,
        emailVerifyTokenHash: hashToken(rawVerify),
        emailVerifyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    try {
      await sendVerifyEmail(user, rawVerify);
    } catch (mailErr) {
      console.error("Verify email send failed:", mailErr.message);
    }

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

    if (email !== req.user.email) {
      const rawVerify = createToken();
      data.emailVerifiedAt = null;
      data.emailVerifyTokenHash = hashToken(rawVerify);
      data.emailVerifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      try {
        await sendVerifyEmail({ ...req.user, email, name: data.name }, rawVerify);
      } catch (mailErr) {
        console.error("Re-verify email send failed:", mailErr.message);
      }
    }

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

router.post("/onboarding", requireAuth, async (req, res, next) => {
  try {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid onboarding data."
      });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        workspaceName: parsed.data.workspaceName,
        company: parsed.data.company || parsed.data.workspaceName,
        timezone: parsed.data.timezone || "UTC",
        onboardingComplete: true
      }
    });

    const auth = issueAuth(res, user);
    return res.json({ ok: true, ...auth });
  } catch (err) {
    next(err);
  }
});

router.post("/resend-verification", requireAuth, async (req, res, next) => {
  try {
    if (req.user.emailVerifiedAt) {
      return res.json({ ok: true, alreadyVerified: true });
    }
    const rawVerify = createToken();
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        emailVerifyTokenHash: hashToken(rawVerify),
        emailVerifyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });
    await sendVerifyEmail(req.user, rawVerify);
    return res.json({ ok: true, sent: true });
  } catch (err) {
    next(err);
  }
});

router.post("/verify-email", async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      return res.status(400).json({ ok: false, error: "Verification token required." });
    }
    const tokenHash = hashToken(token);
    const user = await prisma.user.findFirst({
      where: {
        emailVerifyTokenHash: tokenHash,
        emailVerifyExpiresAt: { gt: new Date() }
      }
    });
    if (!user) {
      return res.status(400).json({ ok: false, error: "Invalid or expired verification link." });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerifyTokenHash: null,
        emailVerifyExpiresAt: null
      }
    });
    const auth = issueAuth(res, updated);
    return res.json({ ok: true, ...auth });
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return res.status(400).json({ ok: false, error: "Enter your email." });
    }

    // Always return ok to avoid email enumeration
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const raw = createToken();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: hashToken(raw),
          passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      });
      const link = `${config.appUrl}/pages/reset-password.html?token=${encodeURIComponent(raw)}`;
      try {
        await sendEmail({
          to: user.email,
          subject: "Reset your Project Alpha password",
          text: `Hi ${user.name},\n\nReset your password:\n${link}\n\nThis link expires in 1 hour.`
        });
      } catch (mailErr) {
        console.error("Reset email send failed:", mailErr.message);
      }
    }
    return res.json({
      ok: true,
      message: "If that email exists, a reset link was sent."
    });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    if (!token || password.length < 8) {
      return res.status(400).json({
        ok: false,
        error: "Valid token and password (8+ characters) required."
      });
    }
    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: { gt: new Date() }
      }
    });
    if (!user) {
      return res.status(400).json({ ok: false, error: "Invalid or expired reset link." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null
      }
    });
    const auth = issueAuth(res, updated);
    return res.json({ ok: true, ...auth });
  } catch (err) {
    next(err);
  }
});

export default router;
