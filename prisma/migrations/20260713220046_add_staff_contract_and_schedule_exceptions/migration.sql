-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('FIXED', 'COMMISSION', 'MIXED');

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "contractType" "ContractType" NOT NULL DEFAULT 'FIXED',
ALTER COLUMN "baseSalary" SET DEFAULT 0.0,
ALTER COLUMN "commissionRate" SET DEFAULT 0.0;

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "professionalId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleException_tenantId_idx" ON "ScheduleException"("tenantId");

-- CreateIndex
CREATE INDEX "ScheduleException_tenantId_professionalId_idx" ON "ScheduleException"("tenantId", "professionalId");

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
