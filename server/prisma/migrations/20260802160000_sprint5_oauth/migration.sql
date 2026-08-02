-- Sprint 5: OAuth multi-provider architecture, RBAC role, connection status

ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'owner';

ALTER TABLE "ConnectedAccount" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "ConnectedAccount" ADD COLUMN "reconnectRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConnectedAccount" ADD COLUMN "lastRefreshedAt" TIMESTAMP(3);
ALTER TABLE "ConnectedAccount" ADD COLUMN "lastValidatedAt" TIMESTAMP(3);

CREATE INDEX "ConnectedAccount_userId_status_idx" ON "ConnectedAccount"("userId", "status");

ALTER TABLE "OAuthState" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'connect';
ALTER TABLE "OAuthState" ADD COLUMN "codeVerifier" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OAuthState" ADD COLUMN "metaJson" TEXT NOT NULL DEFAULT '{}';
