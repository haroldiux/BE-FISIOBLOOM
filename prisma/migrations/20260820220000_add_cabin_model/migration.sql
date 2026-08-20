-- CreateTable
CREATE TABLE "Cabin" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cabin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cabin_tenantId_branchId_idx" ON "Cabin"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Cabin_branchId_name_key" ON "Cabin"("branchId", "name");

-- AddForeignKey
ALTER TABLE "Cabin" ADD CONSTRAINT "Cabin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cabin" ADD CONSTRAINT "Cabin_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
