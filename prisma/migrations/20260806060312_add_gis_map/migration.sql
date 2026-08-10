-- CreateTable
CREATE TABLE "GisMap" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "geometry" JSONB,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GisMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GisMap_category_idx" ON "GisMap"("category");

-- CreateIndex
CREATE INDEX "GisMap_status_publishedAt_idx" ON "GisMap"("status", "publishedAt");
