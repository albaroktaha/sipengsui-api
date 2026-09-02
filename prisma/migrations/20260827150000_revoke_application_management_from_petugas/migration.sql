-- Petugas can review assigned checklist items, but cannot manage the
-- recommendation itself, submit it, or delete it.
DELETE FROM "UserPermission" AS up
USING "Permission" AS p
WHERE up."permissionId" = p."id"
  AND p."slug" IN ('rekomtek.update', 'rekomtek.submit', 'rekomtek.delete')
  AND EXISTS (
    SELECT 1
    FROM "User" AS u
    WHERE u."id" = up."userId"
      AND (
        EXISTS (
          SELECT 1
          FROM "Role" AS petugas_role
          WHERE petugas_role."id" = u."roleId"
            AND petugas_role."name" = 'PETUGAS'
        )
        OR EXISTS (
          SELECT 1
          FROM "UserRole" AS petugas_membership
          JOIN "Role" AS petugas_role
            ON petugas_role."id" = petugas_membership."roleId"
          WHERE petugas_membership."userId" = u."id"
            AND petugas_role."name" = 'PETUGAS'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "Role" AS privileged_role
        WHERE privileged_role."id" = u."roleId"
          AND privileged_role."name" IN ('SUPER_ADMIN', 'ADMIN', 'PIMPINAN')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "UserRole" AS privileged_membership
        JOIN "Role" AS privileged_role
          ON privileged_role."id" = privileged_membership."roleId"
        WHERE privileged_membership."userId" = u."id"
          AND privileged_role."name" IN ('SUPER_ADMIN', 'ADMIN', 'PIMPINAN')
      )
  );
