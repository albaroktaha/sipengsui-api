-- Optimistic token for source mutations and submit gating.
ALTER TABLE "Rekomtek"
ADD COLUMN "sourceRevision" INTEGER NOT NULL DEFAULT 0;
