import { BerkasController } from './berkas.controller';

describe('BerkasController', () => {
  it('delegates managed checklist template listing', async () => {
    const templateService = {
      getManagedTemplates: jest.fn().mockResolvedValue([{ id: 'template-1' }]),
    };
    const controller = new BerkasController(
      {} as never,
      templateService as never,
      {} as never,
      {} as never,
    );

    const user = {
      userId: 'manager-1',
      role: 'SUPER_ADMIN',
      roles: ['SUPER_ADMIN'],
      permissions: [],
    };
    await expect(
      controller.getManagedTemplates(user as never),
    ).resolves.toEqual([{ id: 'template-1' }]);
    expect(templateService.getManagedTemplates).toHaveBeenCalledWith(user);
  });

  it('delegates checklist template create, update, and archive commands', async () => {
    const templateService = {
      createTemplate: jest.fn().mockResolvedValue({ id: 'template-1' }),
      updateTemplate: jest.fn().mockResolvedValue({ id: 'template-1' }),
      archiveTemplate: jest
        .fn()
        .mockResolvedValue({ id: 'template-1', isActive: false }),
    };
    const controller = new BerkasController(
      {} as never,
      templateService as never,
      {} as never,
      {} as never,
    );
    const createDto = {
      jenis: 'GALIAN_C',
      jenisPermohonan: 'IZIN_BARU',
      kode: '99',
      nomorUrut: 99,
      uraian: 'Syarat tambahan',
    };
    const updateDto = { uraian: 'Uraian baru' };
    const user = { userId: 'template-manager' };

    await expect(
      controller.createTemplate(createDto as never, user as never),
    ).resolves.toEqual({ id: 'template-1' });
    await expect(
      controller.updateTemplate(
        'template-1',
        updateDto as never,
        user as never,
      ),
    ).resolves.toEqual({ id: 'template-1' });
    await expect(
      controller.archiveTemplate('template-1', user as never),
    ).resolves.toEqual({ id: 'template-1', isActive: false });

    expect(templateService.createTemplate).toHaveBeenCalledWith(
      createDto,
      user,
    );
    expect(templateService.updateTemplate).toHaveBeenCalledWith(
      'template-1',
      updateDto,
      user,
    );
    expect(templateService.archiveTemplate).toHaveBeenCalledWith(
      'template-1',
      user,
    );
  });

  it('does not run the expensive Drive revalidation during checklist reads', async () => {
    const rekomtekService = {
      canAccess: jest.fn().mockResolvedValue({ status: 'REVIEW' }),
    };
    const berkasTemplateService = {};
    const berkasService = {
      revalidateRequired: jest.fn(),
      getByRekomtekId: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    const workflowService = {};
    const controller = new BerkasController(
      rekomtekService as never,
      berkasTemplateService as never,
      berkasService as never,
      workflowService as never,
    );

    await controller.getBerkas(
      'rekomtek-1',
      { page: 1, limit: 20 },
      {
        userId: 'staff-1',
        email: 'staff@example.com',
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.read'],
      },
    );

    expect(berkasService.revalidateRequired).not.toHaveBeenCalled();
    expect(berkasService.getByRekomtekId).toHaveBeenCalledWith('rekomtek-1', {
      page: 1,
      limit: 20,
    });
  });
});
