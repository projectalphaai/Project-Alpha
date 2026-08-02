-- Sprint 4: expand ScheduledPost for publishing queue + ActivityLog

ALTER TABLE "ScheduledPost" ADD COLUMN "errorMessage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ScheduledPost" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScheduledPost" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "ScheduledPost" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "ScheduledPost" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "ScheduledPost" ADD COLUMN "externalPostId" TEXT NOT NULL DEFAULT '';

CREATE INDEX "ScheduledPost_status_scheduledAt_idx" ON "ScheduledPost"("status", "scheduledAt");
CREATE INDEX "ScheduledPost_userId_status_idx" ON "ScheduledPost"("userId", "status");

CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");
CREATE INDEX "ActivityLog_postId_idx" ON "ActivityLog"("postId");

ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ScheduledPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
