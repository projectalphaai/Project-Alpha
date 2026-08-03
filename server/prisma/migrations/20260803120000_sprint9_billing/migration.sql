-- Sprint 9: billing, email verify/reset, workspace, onboarding

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "workspaceName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifyTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifyExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_stripeCustomerId_idx" ON "User"("stripeCustomerId");
CREATE INDEX IF NOT EXISTS "User_subscriptionStatus_idx" ON "User"("subscriptionStatus");

-- Existing accounts skip onboarding so founder demos stay usable
UPDATE "User"
SET
  "onboardingComplete" = true,
  "workspaceName" = CASE
    WHEN COALESCE("workspaceName", '') = '' THEN
      CASE
        WHEN COALESCE("company", '') <> '' THEN "company"
        ELSE COALESCE("name", 'Workspace') || ' Workspace'
      END
    ELSE "workspaceName"
  END
WHERE "onboardingComplete" = false;
