import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from 'class-validator';
import { AssignRoleDto } from './assign-role.dto';

describe('AssignRoleDto role identifiers', () => {
  it('accepts the corrected Petugas Peta role ID and rejects the legacy hash ID', async () => {
    const migrationPath = join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260929161500_fix_petugas_peta_role_uuid',
      'migration.sql',
    );
    const migration = readFileSync(migrationPath, 'utf8');
    const correctedRoleId = migration.match(/SET\s+"id"\s*=\s*'([^']+)'/i)?.[1];

    expect(correctedRoleId).toBeDefined();

    const correctedDto = Object.assign(new AssignRoleDto(), {
      roleId: correctedRoleId,
    });
    const legacyDto = Object.assign(new AssignRoleDto(), {
      roleId: '469226b7-9b22-1257-d7a6-b044a2b0e5b4',
    });

    await expect(validate(correctedDto)).resolves.toHaveLength(0);
    await expect(validate(legacyDto)).resolves.not.toHaveLength(0);
  });
});
