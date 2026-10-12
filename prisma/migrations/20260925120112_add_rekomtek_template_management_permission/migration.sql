INSERT INTO "Permission" ("id", "slug", "name", "group", "createdAt", "updatedAt")
VALUES (
  md5('rekomtek.checklist-template.manage')::uuid,
  'rekomtek.checklist-template.manage',
  'Kelola Template Checklist Rekomtek',
  'rekomtek',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name",
    "group" = EXCLUDED."group",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "UserPermission" ("id", "userId", "permissionId", "createdAt")
SELECT
  md5('rekomtek.checklist-template.manage:' || u."id")::uuid,
  u."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Permission" p
WHERE p."slug" = 'rekomtek.checklist-template.manage'
  AND (
    u."roleId" IN (
      SELECT r."id"
      FROM "Role" r
      WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
    )
    OR EXISTS (
      SELECT 1
      FROM "UserRole" ur
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id"
        AND r."name" IN ('SUPER_ADMIN', 'ADMIN')
    )
  )
ON CONFLICT ("userId", "permissionId") DO NOTHING;
