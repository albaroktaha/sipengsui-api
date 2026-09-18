-- PETUGAS may read disaster reports but must not create or submit them.
DELETE FROM "UserPermission" up
USING "User" u, "Permission" p
WHERE up."userId" = u."id"
  AND up."permissionId" = p."id"
  AND p."slug" = 'disaster-reports.create'
  AND (
    u."roleId" IN (
      SELECT r."id" FROM "Role" r WHERE r."name" = 'PETUGAS'
    )
    OR EXISTS (
      SELECT 1
      FROM "UserRole" ur
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id" AND r."name" = 'PETUGAS'
    )
  )
  AND NOT (
    u."roleId" IN (
      SELECT r."id"
      FROM "Role" r
      WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN', 'PIMPINAN')
    )
    OR EXISTS (
      SELECT 1
      FROM "UserRole" ur
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id"
        AND r."name" IN ('SUPER_ADMIN', 'ADMIN', 'PIMPINAN')
    )
  );
