import { canManageDashboardNotifications } from './notifications-access';

describe('canManageDashboardNotifications', () => {
  it('allows a Super Admin', () => {
    expect(
      canManageDashboardNotifications({
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN'],
        permissions: [],
      }),
    ).toBe(true);
  });

  it('allows Kepala Seksi through the official-inspection permission', () => {
    expect(
      canManageDashboardNotifications({
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.inspect'],
      }),
    ).toBe(true);
  });

  it('allows Kepala Bidang through the final-approval permission', () => {
    expect(
      canManageDashboardNotifications({
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.approve.final'],
      }),
    ).toBe(true);
  });

  it('denies PIMPINAN without either business permission', () => {
    expect(
      canManageDashboardNotifications({
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.workflow.read'],
      }),
    ).toBe(false);
  });

  it('denies roles outside the requested management boundary', () => {
    expect(
      canManageDashboardNotifications({
        role: 'ADMIN',
        roles: ['ADMIN'],
        permissions: ['*'],
      }),
    ).toBe(false);
  });
});
