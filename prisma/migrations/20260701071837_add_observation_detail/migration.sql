-- CreateTable
CREATE TABLE "ObservationDetail" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "observationTime" TEXT NOT NULL,
    "waterLevel" DECIMAL(8,2),
    "discharge" DECIMAL(10,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservationDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObservationDetail_observationId_idx" ON "ObservationDetail"("observationId");

-- CreateIndex
CREATE INDEX "ObservationDetail_observationTime_idx" ON "ObservationDetail"("observationTime");

-- AddForeignKey
ALTER TABLE "ObservationDetail" ADD CONSTRAINT "ObservationDetail_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
