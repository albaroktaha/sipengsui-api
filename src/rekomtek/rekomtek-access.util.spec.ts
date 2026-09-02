import { isPetugasOnly, isRekomtekStaff } from './rekomtek-access.util';

describe('Rekomtek access helpers', () => {
  it('recognizes the primary staff role when the roles array is stale or empty', () => {
    expect(
      isRekomtekStaff({
        userId: 'superadmin-1',
        email: 'superadmin@example.com',
        role: 'SUPER_ADMIN',
        roles: [],
        permissions: ['*'],
      }),
    ).toBe(true);
    expect(
      isRekomtekStaff({
        userId: 'official-1',
        email: 'official@example.com',
        role: 'PIMPINAN',
        roles: [],
        permissions: ['rekomtek.workflow.read'],
      }),
    ).toBe(true);
  });

  it('identifies a Petugas without management roles', () => {
    expect(
      isPetugasOnly({
        userId: 'petugas-1',
        email: 'petugas@example.com',
        role: 'PETUGAS',
        roles: [],
        permissions: ['rekomtek.evaluate'],
      }),
    ).toBe(true);
    expect(
      isPetugasOnly({
        userId: 'official-1',
        email: 'official@example.com',
        role: 'PIMPINAN',
        roles: ['PIMPINAN', 'PETUGAS'],
        permissions: ['rekomtek.update'],
      }),
    ).toBe(false);
  });
});
