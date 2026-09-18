-- Kepala Seksi (PIMPINAN with inspection permission) may publish the approved Rekomtek document.
-- Kepala Bidang accounts with only rekomtek.approve.final are intentionally excluded.
INSERT INTO "UserPermission" ("id", "userId", "permissionId")
SELECT md5(u."id" || ':' || publish_permission."id")::uuid,
       u."id",
       publish_permission."id"
FROM "User" u
CROSS JOIN "Permission" publish_permission
WHERE publish_permission."slug" = 'rekomtek.publish.final'
  AND (
    u."roleId" IN (
      SELECT r."id" FROM "Role" r WHERE r."name" = 'PIMPINAN'
    )
    OR EXISTS (
      SELECT 1
      FROM "UserRole" ur
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id" AND r."name" = 'PIMPINAN'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM "UserPermission" inspect_grant
    JOIN "Permission" inspect_permission
      ON inspect_permission."id" = inspect_grant."permissionId"
    WHERE inspect_grant."userId" = u."id"
      AND inspect_permission."slug" = 'rekomtek.inspect'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "UserPermission" approve_grant
    JOIN "Permission" approve_permission
      ON approve_permission."id" = approve_grant."permissionId"
    WHERE approve_grant."userId" = u."id"
      AND approve_permission."slug" = 'rekomtek.approve.final'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "UserPermission" existing_grant
    WHERE existing_grant."userId" = u."id"
      AND existing_grant."permissionId" = publish_permission."id"
  );
