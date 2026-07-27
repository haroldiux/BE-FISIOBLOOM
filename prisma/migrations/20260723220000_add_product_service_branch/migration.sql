-- Separa el catálogo de Productos y Servicios por sucursal: cada sucursal
-- maneja su propio catálogo, en vez de compartir uno solo a nivel de tenant.

ALTER TABLE "Product" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Service" ADD COLUMN "branchId" TEXT;

-- Backfill: cada producto/servicio existente se asigna a la primera sucursal
-- (por fecha de creación) de su propio tenant.
UPDATE "Product" p
SET "branchId" = (
  SELECT b.id FROM "Branch" b
  WHERE b."tenantId" = p."tenantId"
  ORDER BY b."createdAt" ASC
  LIMIT 1
)
WHERE p."branchId" IS NULL;

UPDATE "Service" s
SET "branchId" = (
  SELECT b.id FROM "Branch" b
  WHERE b."tenantId" = s."tenantId"
  ORDER BY b."createdAt" ASC
  LIMIT 1
)
WHERE s."branchId" IS NULL;

ALTER TABLE "Product" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Service" ALTER COLUMN "branchId" SET NOT NULL;

ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX "Product_tenantId_branchId_idx" ON "Product"("tenantId", "branchId");
CREATE INDEX "Service_tenantId_branchId_idx" ON "Service"("tenantId", "branchId");
