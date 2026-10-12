WITH eligible_users AS (
  SELECT u."id"
  FROM "User" u
  WHERE EXISTS (
    SELECT 1
    FROM "Role" r
    WHERE r."name" = 'SUPER_ADMIN'
      AND (
        u."roleId" = r."id"
        OR EXISTS (
          SELECT 1
          FROM "UserRole" ur
          WHERE ur."userId" = u."id"
            AND ur."roleId" = r."id"
        )
      )
  )
  OR (
    (
      EXISTS (
        SELECT 1
        FROM "Role" r
        WHERE r."name" = 'PIMPINAN'
          AND (
            u."roleId" = r."id"
            OR EXISTS (
              SELECT 1
              FROM "UserRole" ur
              WHERE ur."userId" = u."id"
                AND ur."roleId" = r."id"
            )
          )
      )
    )
    AND EXISTS (
      SELECT 1
      FROM "UserPermission" up
      JOIN "Permission" inspect_permission
        ON inspect_permission."id" = up."permissionId"
      WHERE up."userId" = u."id"
        AND inspect_permission."slug" = 'rekomtek.inspect'
    )
  )
)
DELETE FROM "UserPermission" checklist_permission
USING "Permission" permission
WHERE checklist_permission."permissionId" = permission."id"
  AND permission."slug" = 'rekomtek.checklist-template.manage'
  AND NOT EXISTS (
    SELECT 1
    FROM eligible_users eligible
    WHERE eligible."id" = checklist_permission."userId"
  );

WITH eligible_users AS (
  SELECT u."id"
  FROM "User" u
  WHERE EXISTS (
    SELECT 1
    FROM "Role" r
    WHERE r."name" = 'SUPER_ADMIN'
      AND (
        u."roleId" = r."id"
        OR EXISTS (
          SELECT 1
          FROM "UserRole" ur
          WHERE ur."userId" = u."id"
            AND ur."roleId" = r."id"
        )
      )
  )
  OR (
    EXISTS (
      SELECT 1
      FROM "Role" r
      WHERE r."name" = 'PIMPINAN'
        AND (
          u."roleId" = r."id"
          OR EXISTS (
            SELECT 1
            FROM "UserRole" ur
            WHERE ur."userId" = u."id"
              AND ur."roleId" = r."id"
          )
        )
    )
    AND EXISTS (
      SELECT 1
      FROM "UserPermission" up
      JOIN "Permission" inspect_permission
        ON inspect_permission."id" = up."permissionId"
      WHERE up."userId" = u."id"
        AND inspect_permission."slug" = 'rekomtek.inspect'
    )
  )
)
INSERT INTO "UserPermission" ("id", "userId", "permissionId", "createdAt")
SELECT
  md5('rekomtek.checklist-template.manage:' || eligible."id")::uuid,
  eligible."id",
  permission."id",
  CURRENT_TIMESTAMP
FROM eligible_users eligible
CROSS JOIN "Permission" permission
WHERE permission."slug" = 'rekomtek.checklist-template.manage'
ON CONFLICT ("userId", "permissionId") DO NOTHING;
