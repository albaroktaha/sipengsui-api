-- Allow existing operational Rekomtek accounts to open the workflow review queue.
-- The grant is limited to staff roles and users that already have a Rekomtek
-- permission; it does not broaden ordinary applicant access.
INSERT INTO "UserPermission" ("id", "userId", "permissionId", "createdAt")
SELECT
  md5('rekomtek.workflow.read:' || u."id")::uuid,
  u."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Permission" p
WHERE p."slug" = 'rekomtek.workflow.read'
  AND (
    u."roleId" IN (
      SELECT r."id"
      FROM "Role" r
      WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN', 'PETUGAS', 'PIMPINAN')
    )
    OR EXISTS (
      SELECT 1
      FROM "UserRole" ur
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id"
        AND r."name" IN ('SUPER_ADMIN', 'ADMIN', 'PETUGAS', 'PIMPINAN')
    )
  )
  AND EXISTS (
    SELECT 1
    FROM "UserPermission" up
    JOIN "Permission" rp ON rp."id" = up."permissionId"
    WHERE up."userId" = u."id"
      AND rp."slug" LIKE 'rekomtek.%'
  )
ON CONFLICT ("userId", "permissionId") DO NOTHING;
