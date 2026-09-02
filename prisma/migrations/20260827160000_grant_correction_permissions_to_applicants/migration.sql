-- Applicants need to answer active correction findings before resubmitting.
INSERT INTO "UserPermission" ("id", "userId", "permissionId", "createdAt")
SELECT
  md5('rekomtek.applicant-correction:' || u."id" || ':' || p."slug")::uuid,
  u."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "User" AS u
CROSS JOIN "Permission" AS p
WHERE p."slug" IN ('rekomtek.correct.initial', 'rekomtek.correct.post-expose')
  AND (
    EXISTS (
      SELECT 1
      FROM "Role" AS applicant_role
      WHERE applicant_role."id" = u."roleId"
        AND applicant_role."name" = 'USER'
    )
    OR EXISTS (
      SELECT 1
      FROM "UserRole" AS applicant_membership
      JOIN "Role" AS applicant_role
        ON applicant_role."id" = applicant_membership."roleId"
      WHERE applicant_membership."userId" = u."id"
        AND applicant_role."name" = 'USER'
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Role" AS privileged_role
    WHERE privileged_role."id" = u."roleId"
      AND privileged_role."name" IN ('SUPER_ADMIN', 'ADMIN', 'PETUGAS', 'PIMPINAN')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "UserRole" AS privileged_membership
    JOIN "Role" AS privileged_role
      ON privileged_role."id" = privileged_membership."roleId"
    WHERE privileged_membership."userId" = u."id"
      AND privileged_role."name" IN ('SUPER_ADMIN', 'ADMIN', 'PETUGAS', 'PIMPINAN')
  )
ON CONFLICT ("userId", "permissionId") DO NOTHING;
