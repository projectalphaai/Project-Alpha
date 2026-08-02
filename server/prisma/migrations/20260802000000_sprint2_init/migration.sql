-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountUsername" TEXT NOT NULL DEFAULT '',
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL DEFAULT '',
    "tokenExpiresAt" TIMESTAMP(3),
    "pageId" TEXT NOT NULL DEFAULT '',
    "pageAccessTokenEnc" TEXT NOT NULL DEFAULT '',
    "scopes" TEXT NOT NULL DEFAULT '',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "ConnectedAccount_userId_platform_idx" ON "ConnectedAccount"("userId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_userId_platform_accountId_key" ON "ConnectedAccount"("userId", "platform", "accountId");

-- CreateIndex
CREATE INDEX "ScheduledPost_userId_scheduledAt_idx" ON "ScheduledPost"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ContentDraft_userId_createdAt_idx" ON "ContentDraft"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");

-- CreateIndex
CREATE INDEX "OAuthState_userId_idx" ON "OAuthState"("userId");

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
