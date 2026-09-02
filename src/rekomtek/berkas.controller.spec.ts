import { BerkasController } from './berkas.controller';

describe('BerkasController', () => {
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
