-- Synchronize legacy primary roles with the multi-role assignments.
-- Staff roles take precedence over USER when a user was promoted through
-- UserRole but the legacy User.roleId remained USER.
WITH ranked_staff_roles AS (
  SELECT
    u."id" AS user_id,
    r."id" AS role_id,
    ROW_NUMBER() OVER (
      PARTITION BY u."id"
      ORDER BY CASE r."name"
        WHEN 'SUPER_ADMIN' THEN 1
        WHEN 'ADMIN' THEN 2
        WHEN 'PIMPINAN' THEN 3
        WHEN 'PETUGAS' THEN 4
        ELSE 99
      END
    ) AS rank_number
  FROM "User" u
  JOIN "UserRole" ur ON ur."userId" = u."id"
  JOIN "Role" r ON r."id" = ur."roleId"
  WHERE u."roleId" = (
    SELECT id FROM "Role" WHERE "name" = 'USER'
  )
    AND r."name" IN ('SUPER_ADMIN', 'ADMIN', 'PIMPINAN', 'PETUGAS')
)
UPDATE "User" u
SET "roleId" = ranked.role_id
FROM ranked_staff_roles ranked
WHERE ranked.rank_number = 1
  AND u."id" = ranked.user_id;

DELETE FROM "UserRole" user_role_membership
USING "Role" user_role
WHERE user_role_membership."roleId" = user_role."id"
  AND user_role."name" = 'USER'
  AND EXISTS (
    SELECT 1
    FROM "UserRole" staff_membership
    JOIN "Role" staff_role ON staff_role."id" = staff_membership."roleId"
    WHERE staff_membership."userId" = user_role_membership."userId"
      AND staff_role."name" IN ('SUPER_ADMIN', 'ADMIN', 'PIMPINAN', 'PETUGAS')
  );
