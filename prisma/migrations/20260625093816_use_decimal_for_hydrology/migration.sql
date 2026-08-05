/*
  Warnings:

  - You are about to alter the column `rainfall` on the `Observation` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(8,2)`.
  - You are about to alter the column `waterLevel` on the `Observation` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(8,2)`.
  - You are about to alter the column `discharge` on the `Observation` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `latitude` on the `Station` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,8)`.
  - You are about to alter the column `longitude` on the `Station` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(11,8)`.
  - You are about to alter the column `elevation` on the `Station` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(8,2)`.

*/
-- AlterTable
ALTER TABLE "Observation" ALTER COLUMN "rainfall" SET DATA TYPE DECIMAL(8,2),
ALTER COLUMN "waterLevel" SET DATA TYPE DECIMAL(8,2),
ALTER COLUMN "discharge" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Station" ALTER COLUMN "latitude" SET DATA TYPE DECIMAL(10,8),
ALTER COLUMN "longitude" SET DATA TYPE DECIMAL(11,8),
ALTER COLUMN "elevation" SET DATA TYPE DECIMAL(8,2);
