CREATE TYPE "DashboardNotificationSeverity" AS ENUM ('INFO', 'WARNING', 'URGENT');
CREATE TYPE "DashboardNotificationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "DashboardNotification" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "severity" "DashboardNotificationSeverity" NOT NULL DEFAULT 'INFO',
  "targetRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "DashboardNotificationStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DashboardNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DashboardNotification_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DashboardNotification_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DashboardNotificationRecipient" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "DashboardNotificationRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DashboardNotificationRecipient_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "DashboardNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DashboardNotificationRecipient_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DashboardNotificationRecipient_notificationId_userId_key"
  ON "DashboardNotificationRecipient"("notificationId", "userId");
CREATE INDEX "DashboardNotification_status_publishedAt_idx"
  ON "DashboardNotification"("status", "publishedAt");
CREATE INDEX "DashboardNotification_expiresAt_idx"
  ON "DashboardNotification"("expiresAt");
CREATE INDEX "DashboardNotificationRecipient_userId_readAt_deliveredAt_idx"
  ON "DashboardNotificationRecipient"("userId", "readAt", "deliveredAt");
CREATE INDEX "DashboardNotificationRecipient_notificationId_deliveredAt_idx"
  ON "DashboardNotificationRecipient"("notificationId", "deliveredAt");
