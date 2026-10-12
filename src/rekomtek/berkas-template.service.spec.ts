import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { BerkasTemplateService } from './berkas-template.service';

describe('BerkasTemplateService', () => {
  const prisma = {
    rekomtekBerkasTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new BerkasTemplateService(prisma as never);
  const manager = {
    userId: 'template-manager',
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN'],
    permissions: [],
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a checklist template for a new recommendation', async () => {
    const input = {
      jenis: 'GALIAN_C',
      jenisPermohonan: 'IZIN_BARU',
      kode: '99',
      nomorUrut: 99,
      uraian: 'Dokumen tambahan yang diperlukan',
      isRequired: false,
      hasSubItems: false,
    } as const;
    const created = { id: 'template-1', ...input, isActive: true };
    prisma.rekomtekBerkasTemplate.findUnique.mockResolvedValue(null);
    prisma.rekomtekBerkasTemplate.create.mockResolvedValue(created);

    await expect(service.createTemplate(input, manager)).resolves.toEqual(
      created,
    );
    expect(prisma.rekomtekBerkasTemplate.create).toHaveBeenCalledWith({
      data: input,
    });
  });

  it('rejects a duplicate active checklist code', async () => {
    prisma.rekomtekBerkasTemplate.findUnique.mockResolvedValue({
      id: 'existing-template',
      isActive: true,
    });

    await expect(
      service.createTemplate(
        {
          jenis: 'GALIAN_C',
          jenisPermohonan: 'IZIN_BARU',
          kode: '1',
          nomorUrut: 1,
          uraian: 'Syarat baru',
        },
        manager,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.rekomtekBerkasTemplate.create).not.toHaveBeenCalled();
  });

  it('rejects a description containing only whitespace', async () => {
    prisma.rekomtekBerkasTemplate.findUnique.mockResolvedValue(null);

    await expect(
      service.createTemplate(
        {
          jenis: 'GALIAN_C',
          jenisPermohonan: 'IZIN_BARU',
          kode: '99',
          nomorUrut: 99,
          uraian: '   ',
        },
        manager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rekomtekBerkasTemplate.findUnique).not.toHaveBeenCalled();
  });

  it('rejects template changes for users without an allowed role', async () => {
    prisma.rekomtekBerkasTemplate.findUnique.mockResolvedValue(null);

    await expect(
      service.createTemplate(
        {
          jenis: 'GALIAN_C',
          jenisPermohonan: 'IZIN_BARU',
          kode: '99',
          nomorUrut: 99,
          uraian: 'Syarat tambahan',
        },
        {
          userId: 'user-no-permission',
          role: 'USER',
          roles: ['USER'],
          permissions: ['rekomtek.checklist-template.manage'],
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rekomtekBerkasTemplate.create).not.toHaveBeenCalled();
  });

  it('rejects ADMIN even when the checklist-management permission is assigned', async () => {
    await expect(
      service.createTemplate(
        {
          jenis: 'GALIAN_C',
          jenisPermohonan: 'IZIN_BARU',
          kode: '99',
          nomorUrut: 99,
          uraian: 'Syarat tambahan',
        },
        {
          userId: 'admin-user',
          role: 'ADMIN',
          roles: ['ADMIN'],
          permissions: ['rekomtek.checklist-template.manage'],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rekomtekBerkasTemplate.create).not.toHaveBeenCalled();
  });

  it('allows Kepala Seksi with PIMPINAN role and rekomtek.inspect permission', async () => {
    const input = {
      jenis: 'GALIAN_C',
      jenisPermohonan: 'IZIN_BARU',
      kode: '99',
      nomorUrut: 99,
      uraian: 'Syarat tambahan',
    } as const;
    prisma.rekomtekBerkasTemplate.findUnique.mockResolvedValue(null);
    prisma.rekomtekBerkasTemplate.create.mockResolvedValue({
      id: 'template-1',
    });

    await expect(
      service.createTemplate(input, {
        userId: 'kepala-seksi',
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.inspect'],
      }),
    ).resolves.toEqual({ id: 'template-1' });
  });

  it('reactivates an archived code instead of creating a duplicate', async () => {
    const input = {
      jenis: 'GALIAN_C',
      jenisPermohonan: 'IZIN_BARU',
      kode: '1',
      nomorUrut: 1,
      uraian: 'Syarat dipulihkan',
    } as const;
    const archived = { id: 'template-archived', isActive: false };
    const restored = { id: archived.id, ...input, isActive: true };
    prisma.rekomtekBerkasTemplate.findUnique.mockResolvedValue(archived);
    prisma.rekomtekBerkasTemplate.update.mockResolvedValue(restored);

    await expect(service.createTemplate(input, manager)).resolves.toEqual(
      restored,
    );
    expect(prisma.rekomtekBerkasTemplate.update).toHaveBeenCalledWith({
      where: { id: archived.id },
      data: { ...input, isActive: true },
    });
    expect(prisma.rekomtekBerkasTemplate.create).not.toHaveBeenCalled();
  });

  it('updates the name and description fields of an active template', async () => {
    const existing = {
      id: 'template-1',
      jenis: 'GALIAN_C',
      jenisPermohonan: 'IZIN_BARU',
      kode: '1',
      isActive: true,
    };
    const updated = { ...existing, uraian: 'Nama checklist diperbarui' };
    prisma.rekomtekBerkasTemplate.findUnique.mockResolvedValue(existing);
    prisma.rekomtekBerkasTemplate.update.mockResolvedValue(updated);

    await expect(
      service.updateTemplate(
        existing.id,
        {
          uraian: ' Nama checklist diperbarui ',
        },
        manager,
      ),
    ).resolves.toEqual(updated);
    expect(prisma.rekomtekBerkasTemplate.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { uraian: 'Nama checklist diperbarui' },
    });
  });

  it('rejects a whitespace-only description when updating a template', async () => {
    prisma.rekomtekBerkasTemplate.findUnique.mockResolvedValue({
      id: 'template-1',
      jenis: 'GALIAN_C',
      jenisPermohonan: 'IZIN_BARU',
      kode: '1',
      isActive: true,
    });

    await expect(
      service.updateTemplate('template-1', { uraian: '   ' }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rekomtekBerkasTemplate.update).not.toHaveBeenCalled();
  });

  it('rejects an update payload containing no defined fields', async () => {
    prisma.rekomtekBerkasTemplate.findUnique.mockResolvedValue({
      id: 'template-1',
      jenis: 'GALIAN_C',
      jenisPermohonan: 'IZIN_BARU',
      kode: '1',
      isActive: true,
    });
    const emptyUpdate = {
      kode: undefined,
      nomorUrut: undefined,
      uraian: undefined,
      isRequired: undefined,
      hasSubItems: undefined,
    };

    await expect(
      service.updateTemplate('template-1', emptyUpdate as never, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rekomtekBerkasTemplate.findUnique).not.toHaveBeenCalled();
  });

  it('archives a template without deleting checklist instances', async () => {
    prisma.rekomtekBerkasTemplate.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.archiveTemplate('template-1', manager),
    ).resolves.toEqual({
      id: 'template-1',
      isActive: false,
    });
    expect(prisma.rekomtekBerkasTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: 'template-1', isActive: true },
      data: { isActive: false },
    });
  });
});
