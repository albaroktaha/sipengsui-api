-- Grant `rekomtek.berkas` to all existing users who already have any rekomtek permission
INSERT INTO "UserPermission" ("userId", "permissionId")
SELECT DISTINCT
  up."userId",
  p_berkas."id" AS "permissionId"
FROM "UserPermission" up
JOIN "Permission" p ON p."id" = up."permissionId"
CROSS JOIN "Permission" p_berkas
WHERE p."slug" LIKE 'rekomtek.%'
  AND p."slug" != 'rekomtek.berkas'
  AND p_berkas."slug" = 'rekomtek.berkas'
  AND NOT EXISTS (
    SELECT 1 FROM "UserPermission" up2
    WHERE up2."userId" = up."userId"
      AND up2."permissionId" = p_berkas."id"
  )
ON CONFLICT ("userId", "permissionId") DO NOTHING;