-- Grant `flowchart.read` + `flowchart.manage` to all existing users
-- who already hold the `dashboard.system` permission (superadmins) or the
-- `users.read` permission (admins), mirroring the rekomtek grant migration.
INSERT INTO "UserPermission" ("userId", "permissionId")
SELECT DISTINCT
  up."userId",
  p_fc."id" AS "permissionId"
FROM "UserPermission" up
CROSS JOIN "Permission" p_fc
WHERE p_fc."slug" IN ('flowchart.read', 'flowchart.manage')
  AND up."permissionId" IN (
    SELECT "id" FROM "Permission"
    WHERE "slug" IN ('dashboard.system', 'users.read')
  )
  AND NOT EXISTS (
    SELECT 1 FROM "UserPermission" up2
    WHERE up2."userId" = up."userId"
      AND up2."permissionId" = p_fc."id"
  )
ON CONFLICT ("userId", "permissionId") DO NOTHING;
