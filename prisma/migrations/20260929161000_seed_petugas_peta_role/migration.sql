INSERT INTO "Role" ("id", "name", "createdAt", "updatedAt")
VALUES (
  md5('sipengsui-role:PETUGAS_PETA')::uuid::text,
  'PETUGAS_PETA'::"RoleType",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;
