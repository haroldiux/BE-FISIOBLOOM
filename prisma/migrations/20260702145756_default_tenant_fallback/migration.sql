-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "serviceId" TEXT,
    "dateTime" DATETIME NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "cabin" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("branchId", "cabin", "createdAt", "dateTime", "duration", "id", "patientId", "professionalId", "serviceId", "status", "tenantId", "updatedAt") SELECT "branchId", "cabin", "createdAt", "dateTime", "duration", "id", "patientId", "professionalId", "serviceId", "status", "tenantId", "updatedAt" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
CREATE INDEX "Appointment_tenantId_idx" ON "Appointment"("tenantId");
CREATE INDEX "Appointment_tenantId_branchId_idx" ON "Appointment"("tenantId", "branchId");
CREATE TABLE "new_Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Branch" ("address", "createdAt", "id", "isActive", "name", "phone", "tenantId", "updatedAt") SELECT "address", "createdAt", "id", "isActive", "name", "phone", "tenantId", "updatedAt" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE INDEX "Branch_tenantId_idx" ON "Branch"("tenantId");
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL,
    "discountValue" REAL NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("createdAt", "description", "discountType", "discountValue", "endDate", "id", "isActive", "name", "startDate", "tenantId", "updatedAt") SELECT "createdAt", "description", "discountType", "discountValue", "endDate", "id", "isActive", "name", "startDate", "tenantId", "updatedAt" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");
CREATE TABLE "new_CashMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "cashRegisterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "invoiceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CashMovement" ("amount", "cashRegisterId", "createdAt", "description", "id", "invoiceId", "tenantId", "type", "userId") SELECT "amount", "cashRegisterId", "createdAt", "description", "id", "invoiceId", "tenantId", "type", "userId" FROM "CashMovement";
DROP TABLE "CashMovement";
ALTER TABLE "new_CashMovement" RENAME TO "CashMovement";
CREATE UNIQUE INDEX "CashMovement_invoiceId_key" ON "CashMovement"("invoiceId");
CREATE INDEX "CashMovement_tenantId_idx" ON "CashMovement"("tenantId");
CREATE TABLE "new_CashRegister" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "branchId" TEXT,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "openingDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closingDate" DATETIME,
    "initialBalance" REAL NOT NULL,
    "expectedBalance" REAL NOT NULL,
    "actualBalance" REAL,
    "discrepancy" REAL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CashRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashRegister_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CashRegister_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashRegister_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CashRegister" ("actualBalance", "branchId", "closedById", "closingDate", "createdAt", "discrepancy", "expectedBalance", "id", "initialBalance", "notes", "openedById", "openingDate", "status", "tenantId", "updatedAt") SELECT "actualBalance", "branchId", "closedById", "closingDate", "createdAt", "discrepancy", "expectedBalance", "id", "initialBalance", "notes", "openedById", "openingDate", "status", "tenantId", "updatedAt" FROM "CashRegister";
DROP TABLE "CashRegister";
ALTER TABLE "new_CashRegister" RENAME TO "CashRegister";
CREATE INDEX "CashRegister_tenantId_idx" ON "CashRegister"("tenantId");
CREATE INDEX "CashRegister_tenantId_branchId_idx" ON "CashRegister"("tenantId", "branchId");
CREATE TABLE "new_Commission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "staffId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payrollId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Commission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Commission_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Commission_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Commission_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "PayrollEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Commission" ("amount", "appointmentId", "createdAt", "id", "payrollId", "staffId", "status", "tenantId", "updatedAt") SELECT "amount", "appointmentId", "createdAt", "id", "payrollId", "staffId", "status", "tenantId", "updatedAt" FROM "Commission";
DROP TABLE "Commission";
ALTER TABLE "new_Commission" RENAME TO "Commission";
CREATE UNIQUE INDEX "Commission_appointmentId_key" ON "Commission"("appointmentId");
CREATE INDEX "Commission_tenantId_idx" ON "Commission"("tenantId");
CREATE TABLE "new_ConsentDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "patientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "signatureData" TEXT NOT NULL,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsentDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsentDocument_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ConsentDocument" ("id", "patientId", "serviceId", "signatureData", "signedAt", "tenantId") SELECT "id", "patientId", "serviceId", "signatureData", "signedAt", "tenantId" FROM "ConsentDocument";
DROP TABLE "ConsentDocument";
ALTER TABLE "new_ConsentDocument" RENAME TO "ConsentDocument";
CREATE INDEX "ConsentDocument_tenantId_idx" ON "ConsentDocument"("tenantId");
CREATE TABLE "new_Coupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL,
    "discountValue" REAL NOT NULL,
    "minSubtotal" REAL NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Coupon_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Coupon" ("code", "createdAt", "description", "discountType", "discountValue", "endDate", "id", "isActive", "maxUses", "minSubtotal", "startDate", "tenantId", "updatedAt", "usedCount") SELECT "code", "createdAt", "description", "discountType", "discountValue", "endDate", "id", "isActive", "maxUses", "minSubtotal", "startDate", "tenantId", "updatedAt", "usedCount" FROM "Coupon";
DROP TABLE "Coupon";
ALTER TABLE "new_Coupon" RENAME TO "Coupon";
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX "Coupon_tenantId_idx" ON "Coupon"("tenantId");
CREATE TABLE "new_InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "branchId" TEXT,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "appointmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryMovement" ("appointmentId", "branchId", "createdAt", "id", "notes", "productId", "quantity", "tenantId", "type") SELECT "appointmentId", "branchId", "createdAt", "id", "notes", "productId", "quantity", "tenantId", "type" FROM "InventoryMovement";
DROP TABLE "InventoryMovement";
ALTER TABLE "new_InventoryMovement" RENAME TO "InventoryMovement";
CREATE INDEX "InventoryMovement_tenantId_idx" ON "InventoryMovement"("tenantId");
CREATE INDEX "InventoryMovement_tenantId_branchId_idx" ON "InventoryMovement"("tenantId", "branchId");
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "subtotal" REAL NOT NULL,
    "tax" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PAGADO',
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "couponId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("appointmentId", "branchId", "couponId", "createdAt", "id", "paidAt", "patientId", "paymentMethod", "reference", "status", "subtotal", "tax", "tenantId", "total", "updatedAt") SELECT "appointmentId", "branchId", "couponId", "createdAt", "id", "paidAt", "patientId", "paymentMethod", "reference", "status", "subtotal", "tax", "tenantId", "total", "updatedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_appointmentId_key" ON "Invoice"("appointmentId");
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");
CREATE INDEX "Invoice_tenantId_branchId_idx" ON "Invoice"("tenantId", "branchId");
CREATE TABLE "new_InvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "unitPrice" REAL NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "total" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InvoiceItem" ("createdAt", "description", "id", "invoiceId", "productId", "quantity", "tenantId", "total", "unitPrice") SELECT "createdAt", "description", "id", "invoiceId", "productId", "quantity", "tenantId", "total", "unitPrice" FROM "InvoiceItem";
DROP TABLE "InvoiceItem";
ALTER TABLE "new_InvoiceItem" RENAME TO "InvoiceItem";
CREATE INDEX "InvoiceItem_tenantId_idx" ON "InvoiceItem"("tenantId");
CREATE TABLE "new_PackageTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "validityDays" INTEGER NOT NULL DEFAULT 90,
    "totalPrice" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PackageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PackageTemplate" ("createdAt", "description", "id", "isActive", "name", "tenantId", "totalPrice", "updatedAt", "validityDays") SELECT "createdAt", "description", "id", "isActive", "name", "tenantId", "totalPrice", "updatedAt", "validityDays" FROM "PackageTemplate";
DROP TABLE "PackageTemplate";
ALTER TABLE "new_PackageTemplate" RENAME TO "PackageTemplate";
CREATE INDEX "PackageTemplate_tenantId_idx" ON "PackageTemplate"("tenantId");
CREATE TABLE "new_PackageTemplateLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "templateId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PackageTemplateLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PackageTemplateLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PackageTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PackageTemplateLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PackageTemplateLine" ("createdAt", "id", "serviceId", "sessions", "templateId", "tenantId", "updatedAt") SELECT "createdAt", "id", "serviceId", "sessions", "templateId", "tenantId", "updatedAt" FROM "PackageTemplateLine";
DROP TABLE "PackageTemplateLine";
ALTER TABLE "new_PackageTemplateLine" RENAME TO "PackageTemplateLine";
CREATE INDEX "PackageTemplateLine_tenantId_idx" ON "PackageTemplateLine"("tenantId");
CREATE TABLE "new_Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "branchId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "consentSigned" BOOLEAN NOT NULL DEFAULT false,
    "medicalHistory" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Patient_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("branchId", "consentSigned", "createdAt", "email", "fullName", "id", "isActive", "medicalHistory", "phone", "tenantId", "updatedAt") SELECT "branchId", "consentSigned", "createdAt", "email", "fullName", "id", "isActive", "medicalHistory", "phone", "tenantId", "updatedAt" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE INDEX "Patient_tenantId_idx" ON "Patient"("tenantId");
CREATE INDEX "Patient_tenantId_branchId_idx" ON "Patient"("tenantId", "branchId");
CREATE TABLE "new_PayrollEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "staffId" TEXT NOT NULL,
    "baseSalary" REAL NOT NULL,
    "commissionsAmount" REAL NOT NULL,
    "totalPaid" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PayrollEntry" ("baseSalary", "commissionsAmount", "createdAt", "id", "paidAt", "periodEnd", "periodStart", "staffId", "status", "tenantId", "totalPaid", "updatedAt") SELECT "baseSalary", "commissionsAmount", "createdAt", "id", "paidAt", "periodEnd", "periodStart", "staffId", "status", "tenantId", "totalPaid", "updatedAt" FROM "PayrollEntry";
DROP TABLE "PayrollEntry";
ALTER TABLE "new_PayrollEntry" RENAME TO "PayrollEntry";
CREATE INDEX "PayrollEntry_tenantId_idx" ON "PayrollEntry"("tenantId");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("category", "createdAt", "id", "isActive", "name", "price", "stock", "tenantId", "unit", "updatedAt") SELECT "category", "createdAt", "id", "isActive", "name", "price", "stock", "tenantId", "unit", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");
CREATE TABLE "new_RetouchSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "patientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "originalAppointmentId" TEXT NOT NULL,
    "retouchAppointmentId" TEXT,
    "scheduledDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retouchNumber" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RetouchSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RetouchSchedule_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RetouchSchedule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RetouchSchedule_originalAppointmentId_fkey" FOREIGN KEY ("originalAppointmentId") REFERENCES "Appointment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RetouchSchedule_retouchAppointmentId_fkey" FOREIGN KEY ("retouchAppointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RetouchSchedule" ("createdAt", "id", "notes", "originalAppointmentId", "patientId", "retouchAppointmentId", "retouchNumber", "scheduledDate", "serviceId", "status", "tenantId", "updatedAt") SELECT "createdAt", "id", "notes", "originalAppointmentId", "patientId", "retouchAppointmentId", "retouchNumber", "scheduledDate", "serviceId", "status", "tenantId", "updatedAt" FROM "RetouchSchedule";
DROP TABLE "RetouchSchedule";
ALTER TABLE "new_RetouchSchedule" RENAME TO "RetouchSchedule";
CREATE UNIQUE INDEX "RetouchSchedule_retouchAppointmentId_key" ON "RetouchSchedule"("retouchAppointmentId");
CREATE INDEX "RetouchSchedule_tenantId_idx" ON "RetouchSchedule"("tenantId");
CREATE TABLE "new_Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "treatmentType" TEXT NOT NULL DEFAULT 'SINGLE_SESSION',
    "defaultDuration" INTEGER NOT NULL DEFAULT 60,
    "defaultPrice" REAL NOT NULL,
    "retouchConfig" JSONB,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
    "contraindications" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Service" ("category", "contraindications", "createdAt", "defaultDuration", "defaultPrice", "id", "isActive", "name", "requiresConsent", "retouchConfig", "tenantId", "treatmentType", "updatedAt") SELECT "category", "contraindications", "createdAt", "defaultDuration", "defaultPrice", "id", "isActive", "name", "requiresConsent", "retouchConfig", "tenantId", "treatmentType", "updatedAt" FROM "Service";
DROP TABLE "Service";
ALTER TABLE "new_Service" RENAME TO "Service";
CREATE INDEX "Service_tenantId_idx" ON "Service"("tenantId");
CREATE TABLE "new_ServiceCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "serviceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceCampaign_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServiceCampaign" ("campaignId", "createdAt", "id", "serviceId", "tenantId", "updatedAt") SELECT "campaignId", "createdAt", "id", "serviceId", "tenantId", "updatedAt" FROM "ServiceCampaign";
DROP TABLE "ServiceCampaign";
ALTER TABLE "new_ServiceCampaign" RENAME TO "ServiceCampaign";
CREATE INDEX "ServiceCampaign_tenantId_idx" ON "ServiceCampaign"("tenantId");
CREATE UNIQUE INDEX "ServiceCampaign_serviceId_campaignId_key" ON "ServiceCampaign"("serviceId", "campaignId");
CREATE TABLE "new_ServiceConsumable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "serviceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceConsumable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceConsumable_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceConsumable_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServiceConsumable" ("createdAt", "id", "productId", "quantity", "serviceId", "tenantId", "updatedAt") SELECT "createdAt", "id", "productId", "quantity", "serviceId", "tenantId", "updatedAt" FROM "ServiceConsumable";
DROP TABLE "ServiceConsumable";
ALTER TABLE "new_ServiceConsumable" RENAME TO "ServiceConsumable";
CREATE INDEX "ServiceConsumable_tenantId_idx" ON "ServiceConsumable"("tenantId");
CREATE UNIQUE INDEX "ServiceConsumable_serviceId_productId_key" ON "ServiceConsumable"("serviceId", "productId");
CREATE TABLE "new_SessionDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "appointmentId" TEXT NOT NULL,
    "packageLineId" TEXT,
    "evolutionNotes" TEXT,
    "measurements" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionDetail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionDetail_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionDetail_packageLineId_fkey" FOREIGN KEY ("packageLineId") REFERENCES "TreatmentPackageLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SessionDetail" ("appointmentId", "createdAt", "evolutionNotes", "id", "measurements", "packageLineId", "tenantId", "updatedAt") SELECT "appointmentId", "createdAt", "evolutionNotes", "id", "measurements", "packageLineId", "tenantId", "updatedAt" FROM "SessionDetail";
DROP TABLE "SessionDetail";
ALTER TABLE "new_SessionDetail" RENAME TO "SessionDetail";
CREATE UNIQUE INDEX "SessionDetail_appointmentId_key" ON "SessionDetail"("appointmentId");
CREATE INDEX "SessionDetail_tenantId_idx" ON "SessionDetail"("tenantId");
CREATE TABLE "new_StaffProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "userId" TEXT NOT NULL,
    "baseSalary" REAL NOT NULL,
    "commissionRate" REAL NOT NULL,
    "salesTarget" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StaffProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StaffProfile" ("baseSalary", "commissionRate", "createdAt", "id", "salesTarget", "tenantId", "updatedAt", "userId") SELECT "baseSalary", "commissionRate", "createdAt", "id", "salesTarget", "tenantId", "updatedAt", "userId" FROM "StaffProfile";
DROP TABLE "StaffProfile";
ALTER TABLE "new_StaffProfile" RENAME TO "StaffProfile";
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");
CREATE INDEX "StaffProfile_tenantId_idx" ON "StaffProfile"("tenantId");
CREATE TABLE "new_TreatmentPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "patientId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TreatmentPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TreatmentPackage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TreatmentPackage" ("createdAt", "expiresAt", "id", "packageName", "patientId", "purchasedAt", "status", "tenantId", "updatedAt") SELECT "createdAt", "expiresAt", "id", "packageName", "patientId", "purchasedAt", "status", "tenantId", "updatedAt" FROM "TreatmentPackage";
DROP TABLE "TreatmentPackage";
ALTER TABLE "new_TreatmentPackage" RENAME TO "TreatmentPackage";
CREATE INDEX "TreatmentPackage_tenantId_idx" ON "TreatmentPackage"("tenantId");
CREATE TABLE "new_TreatmentPackageLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "packageId" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "usedSessions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TreatmentPackageLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TreatmentPackageLine_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TreatmentPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TreatmentPackageLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TreatmentPackageLine" ("createdAt", "id", "packageId", "serviceId", "serviceName", "tenantId", "totalSessions", "updatedAt", "usedSessions") SELECT "createdAt", "id", "packageId", "serviceId", "serviceName", "tenantId", "totalSessions", "updatedAt", "usedSessions" FROM "TreatmentPackageLine";
DROP TABLE "TreatmentPackageLine";
ALTER TABLE "new_TreatmentPackageLine" RENAME TO "TreatmentPackageLine";
CREATE INDEX "TreatmentPackageLine_tenantId_idx" ON "TreatmentPackageLine"("tenantId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'seed-tenant-aura',
    "branchId" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PHYSIO',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "workingHours" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("branchId", "createdAt", "email", "id", "isActive", "name", "password", "role", "tenantId", "updatedAt", "workingHours") SELECT "branchId", "createdAt", "email", "id", "isActive", "name", "password", "role", "tenantId", "updatedAt", "workingHours" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX "User_tenantId_branchId_idx" ON "User"("tenantId", "branchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
