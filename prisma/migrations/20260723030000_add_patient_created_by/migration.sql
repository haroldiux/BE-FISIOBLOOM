-- Track which user registered each patient, so a professional can immediately
-- see patients they personally created, even before any appointment exists.
ALTER TABLE "Patient" ADD COLUMN "createdById" TEXT;

ALTER TABLE "Patient" ADD CONSTRAINT "Patient_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
