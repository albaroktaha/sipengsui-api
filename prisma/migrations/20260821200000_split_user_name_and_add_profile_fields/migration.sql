-- Add the new profile fields as nullable while existing names are migrated.
ALTER TABLE "User"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "organization" TEXT,
  ADD COLUMN "address" TEXT;

-- Preserve existing display names by treating the final word as lastName.
WITH normalized AS (
  SELECT
    id,
    regexp_replace(btrim("name"), '\\s+', ' ', 'g') AS full_name
  FROM "User"
)
UPDATE "User" AS u
SET
  "firstName" = COALESCE(
    NULLIF(
      CASE
        WHEN position(' ' IN n.full_name) > 0 THEN
          left(n.full_name, length(n.full_name) - position(' ' IN reverse(n.full_name)))
        ELSE n.full_name
      END,
      ''
    ),
    'Pengguna'
  ),
  "lastName" = CASE
    WHEN position(' ' IN n.full_name) > 0 THEN reverse(split_part(reverse(n.full_name), ' ', 1))
    ELSE ''
  END
FROM normalized AS n
WHERE u.id = n.id;

ALTER TABLE "User"
  ALTER COLUMN "firstName" SET NOT NULL,
  ALTER COLUMN "lastName" SET NOT NULL;

ALTER TABLE "User" DROP COLUMN "name";
