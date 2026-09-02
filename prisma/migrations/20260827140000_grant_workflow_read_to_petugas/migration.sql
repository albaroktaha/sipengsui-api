-- Allow Petugas to open workflow details and see the checklist review actions.
INSERT INTO "UserPermission" ("id", "userId", "permissionId", "createdAt")
SELECT
  md5('rekomtek.petugas.workflow-read:' || u."id")::uuid,
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
