import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ChecklistTemplateManagementGuard } from './checklist-template-management.guard';

describe('ChecklistTemplateManagementGuard', () => {
  const guard = new ChecklistTemplateManagementGuard();
  const contextFor = (user: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as ExecutionContext;

  it('allows SUPER_ADMIN without relying on an extra permission assignment', () => {
    expect(
      guard.canActivate(
        contextFor({
          role: 'SUPER_ADMIN',
          roles: ['SUPER_ADMIN'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('allows Kepala Seksi: PIMPINAN with rekomtek.inspect', () => {
    expect(
      guard.canActivate(
        contextFor({
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.inspect'],
        }),
      ),
    ).toBe(true);
  });

  it.each([
    [
      'ADMIN with the checklist permission',
      {
        role: 'ADMIN',
        roles: ['ADMIN'],
        permissions: ['rekomtek.checklist-template.manage'],
      },
    ],
    [
      'Kepala Bidang without inspection authority',
      {
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.approve.final'],
      },
    ],
    [
      'a wildcard permission without an allowed role',
      { role: 'PETUGAS', roles: ['PETUGAS'], permissions: ['*'] },
    ],
  ])('denies %s', (_label, user) => {
    expect(() => guard.canActivate(contextFor(user))).toThrow(
      ForbiddenException,
    );
  });
});
