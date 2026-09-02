-- Give operational Petugas accounts the permissions required to review
-- assigned Rekomtek checklists and record notes/status.
INSERT INTO "UserPermission" ("id", "userId", "permissionId", "createdAt")
SELECT
  md5('rekomtek.petugas:' || p."slug" || ':' || u."id")::uuid,
  u."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Permission" p
WHERE p."slug" IN ('rekomtek.read', 'rekomtek.berkas', 'rekomtek.evaluate')
  AND (
    u."roleId" IN (
      SELECT r."id"
      FROM "Role" r
      WHERE r."name" = 'PETUGAS'
    )
    OR EXISTS (
      SELECT 1
      FROM "UserRole" ur
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id"
        AND r."name" = 'PETUGAS'
    )
  )
ON CONFLICT ("userId", "permissionId") DO NOTHING;
