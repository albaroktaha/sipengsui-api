-- Coordinate scheduled dispatch across API replicas for one WAHA session.

CREATE TABLE "WhatsAppDispatchLock" (
  "name" TEXT NOT NULL,
  "lockedUntil" TIMESTAMP(3),
  "lockedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppDispatchLock_pkey" PRIMARY KEY ("name")
);
