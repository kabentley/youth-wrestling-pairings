-- Add per-staff mat preference used by people-rule assignment logic.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffMatNumber" INTEGER;
