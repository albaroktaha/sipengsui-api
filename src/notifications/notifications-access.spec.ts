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

  it('does not give Kepala Bidang notification management through approval permission', () => {
    expect(
      canManageDashboardNotifications({
        role: 'KEPALA_BIDANG',
        roles: ['KEPALA_BIDANG'],
        permissions: ['rekomtek.approve.final'],
      }),
    ).toBe(false);
  });

  it('does not treat PIMPINAN as Kepala Bidang based on a stray approval permission', () => {
    expect(
      canManageDashboardNotifications({
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.approve.final'],
      }),
    ).toBe(false);
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
