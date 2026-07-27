-- Track which user (whoever was logged in at the POS) processed each sale,
-- so standalone product sales with no linked appointment (typical of
-- Recepción) can still be attributed to that staff member's sales performance.
ALTER TABLE "Invoice" ADD COLUMN "soldById" TEXT;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_soldById_fkey"
  FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
