-- Backfill the multi-role junction for users created before registration
-- started creating a UserRole membership.
INSERT INTO "UserRole" ("id", "userId", "roleId")
SELECT
  md5(u."id" || ':' || u."roleId"),
  u."id",
  u."roleId"
FROM "User" u
WHERE u."roleId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "UserRole" ur
    WHERE ur."userId" = u."id"
      AND ur."roleId" = u."roleId"
  );