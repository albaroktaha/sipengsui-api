/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `River` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `Watershed` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "River" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "Watershed" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "River_slug_key" ON "River"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Watershed_slug_key" ON "Watershed"("slug");
