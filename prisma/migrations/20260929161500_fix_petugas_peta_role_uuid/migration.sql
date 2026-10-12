UPDATE "Role"
SET "id" = '6ccd4d52-8974-49ee-b69a-e2282679d616'
WHERE "name" = 'PETUGAS_PETA'::"RoleType"
  AND "id" = md5('sipengsui-role:PETUGAS_PETA')::uuid::text;
