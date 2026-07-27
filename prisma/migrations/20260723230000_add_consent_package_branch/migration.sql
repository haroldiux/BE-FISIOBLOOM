-- Firmas (ConsentDocument) y Paquetes de Tratamiento (TreatmentPackage) también
-- se separan por sucursal, heredando la sucursal del paciente al que pertenecen.

ALTER TABLE "ConsentDocument" ADD COLUMN "branchId" TEXT;
ALTER TABLE "TreatmentPackage" ADD COLUMN "branchId" TEXT;

UPDATE "ConsentDocument" cd
SET "branchId" = p."branchId"
FROM "Patient" p
WHERE p.id = cd."patientId" AND cd."branchId" IS NULL;

UPDATE "TreatmentPackage" tp
SET "branchId" = p."branchId"
FROM "Patient" p
WHERE p.id = tp."patientId" AND tp."branchId" IS NULL;

ALTER TABLE "ConsentDocument" ADD CONSTRAINT "ConsentDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "TreatmentPackage" ADD CONSTRAINT "TreatmentPackage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "ConsentDocument_tenantId_branchId_idx" ON "ConsentDocument"("tenantId", "branchId");
CREATE INDEX "TreatmentPackage_tenantId_branchId_idx" ON "TreatmentPackage"("tenantId", "branchId");
