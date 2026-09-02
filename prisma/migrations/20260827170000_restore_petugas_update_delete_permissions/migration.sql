-- Petugas may manage the recommendation record itself, but submit/review
-- submission remains an applicant-only action.
INSERT INTO "UserPermission" ("id", "userId", "permissionId", "createdAt")
SELECT
  md5('rekomtek.petugas.manage:' || u."id" || ':' || p."slug")::uuid,
  u."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "User" AS u
CROSS JOIN "Permission" AS p
WHERE p."slug" IN ('rekomtek.update', 'rekomtek.delete')
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
ON CONFLICT ("userId", "permissionId") DO NOTHING;
