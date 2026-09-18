-- Remove applicant-only permissions from existing PETUGAS-only accounts.
-- Keep rekomtek.berkas because Petugas uses it for checklist review.
DELETE FROM "UserPermission" up
USING "User" u, "Permission" p
WHERE up."userId" = u."id"
  AND up."permissionId" = p."id"
  AND p."slug" IN (
    'rekomtek.create',
    'rekomtek.submit',
    'rekomtek.correct.initial',
    'rekomtek.correct.post-expose'
  )
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
