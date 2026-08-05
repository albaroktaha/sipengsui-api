-- CreateTable
CREATE TABLE "ImportDraft" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "importType" "ImportType" NOT NULL,
    "metadata" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);
