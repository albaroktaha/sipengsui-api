-- Prevent two active Expose schedules from using the same start instant.
-- Completed and cancelled schedules remain reusable because they are excluded.
CREATE UNIQUE INDEX "RekomtekExposeSchedule_active_startsAt_key"
ON "RekomtekExposeSchedule" ("startsAt")
WHERE "status" IN ('DRAFT', 'TERJADWAL');
