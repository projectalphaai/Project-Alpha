-- Rename ContentDraft -> Draft and expand columns for Sprint 3
ALTER TABLE "ContentDraft" RENAME TO "Draft";

ALTER TABLE "Draft" RENAME COLUMN "goal" TO "contentGoal";

ALTER TABLE "Draft" ADD COLUMN "audience" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Draft" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Draft" ADD COLUMN "shortHook" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Draft" ADD COLUMN "callToAction" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Draft" ADD COLUMN "generatedAt" TIMESTAMP(3);
ALTER TABLE "Draft" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Rename indexes/constraints created for ContentDraft
ALTER INDEX IF EXISTS "ContentDraft_userId_createdAt_idx" RENAME TO "Draft_userId_createdAt_idx";
ALTER TABLE "Draft" RENAME CONSTRAINT "ContentDraft_pkey" TO "Draft_pkey";
ALTER TABLE "Draft" RENAME CONSTRAINT "ContentDraft_userId_fkey" TO "Draft_userId_fkey";
