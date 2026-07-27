-- AlterTable
ALTER TABLE "SessionDetail" ADD COLUMN "additionalPackageLineIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
