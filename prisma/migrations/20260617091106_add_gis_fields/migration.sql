-- AlterTable
ALTER TABLE "River" ADD COLUMN     "geometry" JSONB,
ADD COLUMN     "status" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Watershed" ADD COLUMN     "geometry" JSONB,
ADD COLUMN     "status" BOOLEAN NOT NULL DEFAULT true;
