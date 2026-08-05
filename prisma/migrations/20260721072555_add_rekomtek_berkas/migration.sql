-- CreateEnum
CREATE TYPE "JenisPermohonan" AS ENUM ('IZIN_BARU', 'PERPANJANGAN');

-- AlterTable
ALTER TABLE "Rekomtek" ADD COLUMN     "jenisPermohonan" "JenisPermohonan" NOT NULL DEFAULT 'IZIN_BARU';

-- CreateTable
CREATE TABLE "RekomtekBerkasTemplate" (
    "id" TEXT NOT NULL,
    "jenis" TEXT NOT NULL,
    "jenisPermohonan" "JenisPermohonan" NOT NULL,
    "kode" TEXT NOT NULL,
    "nomorUrut" INTEGER NOT NULL,
    "uraian" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "hasSubItems" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RekomtekBerkasTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RekomtekBerkas" (
    "id" TEXT NOT NULL,
    "rekomtekId" TEXT NOT NULL,
    "templateId" TEXT,
    "kode" TEXT NOT NULL,
    "nomorUrut" INTEGER NOT NULL,
    "uraian" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RekomtekBerkas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RekomtekBerkasTemplate_jenis_jenisPermohonan_idx" ON "RekomtekBerkasTemplate"("jenis", "jenisPermohonan");

-- CreateIndex
CREATE UNIQUE INDEX "RekomtekBerkasTemplate_jenis_jenisPermohonan_kode_key" ON "RekomtekBerkasTemplate"("jenis", "jenisPermohonan", "kode");

-- CreateIndex
CREATE INDEX "RekomtekBerkas_rekomtekId_idx" ON "RekomtekBerkas"("rekomtekId");

-- AddForeignKey
ALTER TABLE "RekomtekBerkas" ADD CONSTRAINT "RekomtekBerkas_rekomtekId_fkey" FOREIGN KEY ("rekomtekId") REFERENCES "Rekomtek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RekomtekBerkas" ADD CONSTRAINT "RekomtekBerkas_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RekomtekBerkasTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
