-- Persist per-bout mat-order lock state used by Mat Assignments reorder.
ALTER TABLE "Bout" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;
