-- Pejabat Rekomtek may assign the Pokja that handles a review.
INSERT INTO "UserPermission" ("id", "userId", "permissionId", "createdAt")
SELECT
  md5('rekomtek.assign:' || u."id")::uuid,
  u."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Permission" p
WHERE p."slug" = 'rekomtek.assign'
  AND (
    u."roleId" IN (
      SELECT r."id"
      FROM "Role" r
      WHERE r."name" = 'PIMPINAN'
    )
    OR EXISTS (
      SELECT 1
      FROM "UserRole" ur
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id"
        AND r."name" = 'PIMPINAN'
    )
  )
ON CONFLICT ("userId", "permissionId") DO NOTHING;
