-- CreateTable
CREATE TABLE "ClipSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "transcriptJson" TEXT NOT NULL DEFAULT '{}',
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipMoment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 50,
    "explanation" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipMoment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL,
    "momentIdsJson" TEXT NOT NULL DEFAULT '[]',
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "captionsJson" TEXT NOT NULL DEFAULT '[]',
    "hashtags" TEXT NOT NULL DEFAULT '',
    "styleJson" TEXT NOT NULL DEFAULT '{}',
    "aiExplanationJson" TEXT NOT NULL DEFAULT '{}',
    "renderStatus" TEXT NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "outputUrl" TEXT NOT NULL DEFAULT '',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "durationSec" DOUBLE PRECISION,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipPublication" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "externalPostId" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipAnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "clipPublicationId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER NOT NULL DEFAULT 0,
    "watchTimeSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionPct" DOUBLE PRECISION,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "followersGained" INTEGER NOT NULL DEFAULT 0,
    "rawJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "ClipAnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClipSource_userId_createdAt_idx" ON "ClipSource"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ClipSource_status_idx" ON "ClipSource"("status");

-- CreateIndex
CREATE INDEX "ClipMoment_sourceId_type_idx" ON "ClipMoment"("sourceId", "type");

-- CreateIndex
CREATE INDEX "ClipMoment_sourceId_score_idx" ON "ClipMoment"("sourceId", "score");

-- CreateIndex
CREATE INDEX "Clip_userId_createdAt_idx" ON "Clip"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Clip_sourceId_idx" ON "Clip"("sourceId");

-- CreateIndex
CREATE INDEX "Clip_groupId_idx" ON "Clip"("groupId");

-- CreateIndex
CREATE INDEX "Clip_renderStatus_idx" ON "Clip"("renderStatus");

-- CreateIndex
CREATE INDEX "ClipPublication_clipId_idx" ON "ClipPublication"("clipId");

-- CreateIndex
CREATE INDEX "ClipPublication_userId_status_idx" ON "ClipPublication"("userId", "status");

-- CreateIndex
CREATE INDEX "ClipAnalyticsSnapshot_clipPublicationId_capturedAt_idx" ON "ClipAnalyticsSnapshot"("clipPublicationId", "capturedAt");

-- AddForeignKey
ALTER TABLE "ClipSource" ADD CONSTRAINT "ClipSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipMoment" ADD CONSTRAINT "ClipMoment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ClipSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ClipSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipPublication" ADD CONSTRAINT "ClipPublication_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipPublication" ADD CONSTRAINT "ClipPublication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipAnalyticsSnapshot" ADD CONSTRAINT "ClipAnalyticsSnapshot_clipPublicationId_fkey" FOREIGN KEY ("clipPublicationId") REFERENCES "ClipPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
