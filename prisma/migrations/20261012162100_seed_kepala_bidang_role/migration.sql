INSERT INTO "Role" ("id", "name", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'KEPALA_BIDANG'::"RoleType",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

-- Preserve the existing distinction encoded by PIMPINAN + final-approval
-- permission, but make the approver independently assignable going forward.
WITH "eligibleUsers" AS (
  SELECT DISTINCT u."id"
  FROM "User" u
  JOIN "Role" pejabat ON pejabat."name" = 'PIMPINAN'::"RoleType"
  JOIN "Permission" approval ON approval."slug" = 'rekomtek.approve.final'
  JOIN "UserPermission" up
    ON up."userId" = u."id"
   AND up."permissionId" = approval."id"
  WHERE u."roleId" = pejabat."id"
     OR EXISTS (
       SELECT 1
       FROM "UserRole" membership
       WHERE membership."userId" = u."id"
         AND membership."roleId" = pejabat."id"
     )
)
INSERT INTO "UserRole" ("id", "userId", "roleId", "createdAt")
SELECT
  gen_random_uuid()::text,
  eligible."id",
  head."id",
  CURRENT_TIMESTAMP
FROM "eligibleUsers" eligible
CROSS JOIN "Role" head
WHERE head."name" = 'KEPALA_BIDANG'::"RoleType"
ON CONFLICT ("userId", "roleId") DO NOTHING;

-- Attach the new role as a permission source for existing eligible accounts;
-- retain any explicit manual grant rather than silently changing its origin.
INSERT INTO "UserPermission" (
  "id", "userId", "permissionId", "manualGrant", "sourceRoleIds", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  membership."userId",
  permission."id",
  FALSE,
  ARRAY[head."id"],
  CURRENT_TIMESTAMP
FROM "UserRole" membership
JOIN "Role" head ON head."id" = membership."roleId"
JOIN "Permission" permission
  ON permission."slug" IN (
    'rekomtek.read',
    'rekomtek.workflow.read',
    'rekomtek.approve.final'
  )
WHERE head."name" = 'KEPALA_BIDANG'::"RoleType"
ON CONFLICT ("userId", "permissionId") DO NOTHING;

UPDATE "UserPermission" existing
SET "sourceRoleIds" = array_append(existing."sourceRoleIds", head."id")
FROM "Role" head
JOIN "UserRole" membership ON membership."roleId" = head."id"
JOIN "Permission" permission
  ON permission."slug" IN (
    'rekomtek.read',
    'rekomtek.workflow.read',
    'rekomtek.approve.final'
  )
WHERE head."name" = 'KEPALA_BIDANG'::"RoleType"
  AND existing."userId" = membership."userId"
  AND existing."permissionId" = permission."id"
  AND NOT (head."id" = ANY(existing."sourceRoleIds"));
