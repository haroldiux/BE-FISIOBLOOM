-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "additionalAppointmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
