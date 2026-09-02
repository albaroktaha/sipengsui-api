-- Optimistic token for checklist technical/reviewer mutations.
ALTER TABLE "Rekomtek"
ADD COLUMN "checklistRevision" INTEGER NOT NULL DEFAULT 0;
