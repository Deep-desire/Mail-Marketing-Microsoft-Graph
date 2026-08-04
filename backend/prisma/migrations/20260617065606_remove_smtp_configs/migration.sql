/*
  Warnings:

  - You are about to drop the column `smtp_config_id` on the `uploads` table. All the data in the column will be lost.
  - You are about to drop the `smtp_configs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_smtp_config_id_fkey";

-- AlterTable
ALTER TABLE "uploads" DROP COLUMN "smtp_config_id";

-- DropTable
DROP TABLE "smtp_configs";
