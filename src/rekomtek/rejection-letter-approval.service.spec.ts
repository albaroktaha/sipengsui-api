import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RejectionLetterApprovalService,
  publicRejectionLetterSubject,
} from './rejection-letter-approval.service';
import { hashRejectionLetterVerificationToken } from './rejection-letter-token';
import { resolveRejectionLetterLayoutConfig } from './rejection-letter-layout';

const activeSettings = {
  activeHeadUserId: 'head-1',
};

const user = (overrides: Record<string, unknown> = {}) => ({
  userId: 'head-1',
  email: 'head@example.test',
  role: 'KEPALA_BIDANG',
  roles: ['KEPALA_BIDANG'],
  permissions: ['rekomtek.approve.final'],
  ...overrides,
});

const officialSettings = {
  institutionName: 'Dinas Sumber Daya Air',
  institutionAddress: 'Alamat instansi',
  issueCity: 'Bandung',
  verificationDomain: 'https://example.go.id',
  outgoingNumberFormat: '{{sequence}}/{{classification}}/{{year}}',
  classificationCode: '600.1',
  agendaSource: 'Sekretariat',
  agendaScope: 'REKOMTEK',
  initialLastNumber: 0,
  numberResetRule: 'TAHUNAN',
  activeHeadUserId: '550e8400-e29b-41d4-a716-446655440000',
  activeHeadName: 'Nama Kepala Bidang',
  activeHeadPosition: 'Kepala Bidang',
  authorityStartsAt: '2026-01-01T00:00:00.000Z',
  authorityEndsAt: '2026-12-31T23:59:59.000Z',
  templates: [
    {
      rekomtekType: 'APU',
      jenisPermohonan: 'IZIN_BARU',
      subjectTemplate: 'Penolakan {{applicationNumber}}',
      bodyTemplate:
        '{{companyName}} {{applicationNumber}} {{applicationTitle}} {{applicationType}} {{evaluationSummary}} {{rejectionReasons}}',
      closingTemplate: 'Hormat kami, {{signatoryName}}',
    },
  ],
};

function extractPdfText(pdf: Buffer): string {
  const directory = mkdtempSync(join(tmpdir(), 'rejection-letter-qr-'));
  try {
    const path = join(directory, 'official.pdf');
    writeFileSync(path, pdf);
    return execFileSync('pdftotext', ['-layout', path, '-'], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function officialApprovalFixture() {
  const updatedAt = new Date('2026-10-07T06:00:00.000Z');
  const job = {
    id: 'job-new',
    status: 'WAITING_APPROVAL',
    rekomtekId: 'r-1',
    updatedAt,
    isTestOnly: false,
    outgoingNumber: null,
    issuedAt: null,
    applicantSnapshot: {
      applicationNumber: 'RKT/001/2026',
      applicationTitle: 'Air',
      applicationType: 'APU / IZIN_BARU',
      applicantName: 'Pemohon',
    },
    evaluationSnapshot: {
      summary: 'Tidak memenuhi',
      findings: [{ requirement: 'Berkas', note: 'Belum lengkap' }],
    },
    events: [],
    rekomtek: {
      nomor: 'RKT/001/2026',
      judul: 'Air',
      jenis: 'APU',
      jenisPermohonan: 'IZIN_BARU',
      workflowStage: 'PENYUSUNAN_SURAT_PENOLAKAN',
    },
  };
  const settings = {
    ...officialSettings,
    activeHeadUserId: 'head-1',
    activeHeadNip: '198001012000011001',
    logoDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lJkAAAAASUVORK5CYII=',
    authorityStartsAt: new Date('2000-01-01'),
    authorityEndsAt: new Date('2100-01-01'),
  };
  const tx = {
    rejectionLetterNumberSequence: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }),
    },
    rejectionLetterJob: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    rejectionLetterJobEvent: { create: jest.fn() },
    rekomtekArtifact: {
      aggregate: jest.fn().mockResolvedValue({ _max: { version: 0 } }),
      create: jest.fn(),
    },
  };
  const prisma = {
    rejectionLetterSettings: {
      findUnique: jest.fn().mockResolvedValue(settings),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
    rejectionLetterJob: {
      findUnique: jest.fn().mockResolvedValue(job),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    rejectionLetterJobEvent: { create: jest.fn() },
    rejectionLetterTemplate: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ ...officialSettings.templates[0], version: 1 }),
    },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) =>
      Promise.resolve(fn(tx)),
    ),
  };
  let bytes = Buffer.alloc(0);
  const storage = {
    storeGeneratedPdf: jest.fn((pdf: Buffer) => {
      bytes = pdf;
      return Promise.resolve('private/final.pdf');
    }),
    readBuffer: jest.fn(() => Promise.resolve(bytes)),
    remove: jest.fn(),
  };
  const workflow = { transitionRejectionToIssuedInTransaction: jest.fn() };
  const service = new RejectionLetterApprovalService(
    prisma as never,
    storage as never,
    workflow as never,
  );
  return {
    updatedAt,
    job,
    settings,
    tx,
    prisma,
    storage,
    workflow,
    service,
    getBytes: () => bytes,
  };
}

describe('RejectionLetterApprovalService approval queue', () => {
  it('reports runtime QR prerequisites without claiming TTE', async () => {
    const previous = {
      appUrl: process.env.APP_URL,
      regularFont: process.env.REJECTION_LETTER_ARIAL_REGULAR_PATH,
      boldFont: process.env.REJECTION_LETTER_ARIAL_BOLD_PATH,
    };
    process.env.APP_URL = 'https://example.go.id';
    process.env.REJECTION_LETTER_ARIAL_REGULAR_PATH = 'C:/missing/Arial.ttf';
    process.env.REJECTION_LETTER_ARIAL_BOLD_PATH = 'C:/missing/Arial_Bold.ttf';
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue({
          ...officialSettings,
          activeHeadUserId: 'head-1',
          activeHeadNip: '198001012000011001',
          logoDataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lJkAAAAASUVORK5CYII=',
          authorityStartsAt: new Date('2000-01-01T00:00:00.000Z'),
          authorityEndsAt: new Date('2100-01-01T00:00:00.000Z'),
        }),
      },
      rejectionLetterTemplate: {
        findMany: jest.fn().mockResolvedValue([{ id: 'template-1' }]),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    try {
      const result = await service.getSettings(
        user({
          role: 'ADMIN',
          roles: ['ADMIN'],
          permissions: ['rekomtek.rejection-letter.manage'],
        }),
      );

      expect(result.qrIssuanceReadiness).toMatchObject({
        method: 'HEAD_APPROVAL_QR',
        ready: false,
        blockers: ['Font Arial Regular dan Bold tersedia di runtime API'],
      });
      expect(result.signingEnabled).toBe(false);
      expect(result.activationStatus).toContain('TTE dinonaktifkan');
    } finally {
      if (previous.appUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous.appUrl;
      if (previous.regularFont === undefined)
        delete process.env.REJECTION_LETTER_ARIAL_REGULAR_PATH;
      else
        process.env.REJECTION_LETTER_ARIAL_REGULAR_PATH = previous.regularFont;
      if (previous.boldFont === undefined)
        delete process.env.REJECTION_LETTER_ARIAL_BOLD_PATH;
      else process.env.REJECTION_LETTER_ARIAL_BOLD_PATH = previous.boldFont;
    }
  });

  it('lists pending and retryable jobs and local QR test issues for the active authorized head', async () => {
    const jobs = [
      { id: 'job-1', status: 'WAITING_APPROVAL', isTestOnly: false },
      { id: 'job-test', status: 'ISSUED', isTestOnly: true },
    ];
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue(activeSettings),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
      rejectionLetterJob: {
        findMany: jest.fn().mockResolvedValue(jobs),
      },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    await expect(service.listApprovalQueue(user() as never)).resolves.toEqual(
      jobs,
    );
    expect(prisma.rejectionLetterJob.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            status: {
              in: [
                'WAITING_APPROVAL',
                'APPROVED_PREPARING',
                'FAILED',
                'BLOCKED_TTE',
              ],
            },
          },
          { status: 'ISSUED', isTestOnly: true },
        ],
      },
      // Jest asymmetric matcher return types are intentionally dynamic.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      select: expect.objectContaining({
        id: true,
        status: true,
        isTestOnly: true,
        issuanceMethod: true,
        rekomtekId: true,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        evaluationRound: expect.any(Object),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        rekomtek: expect.any(Object),
      }),
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  });

  it('denies another PIMPINAN account before querying the queue', async () => {
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue(activeSettings),
      },
      rejectionLetterJob: {
        findMany: jest.fn(),
      },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    await expect(
      service.listApprovalQueue(user({ userId: 'other-head' }) as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rejectionLetterJob.findMany).not.toHaveBeenCalled();
  });

  it('rechecks current active-head assignment instead of trusting a stale token', async () => {
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue({ activeHeadUserId: 'head-1' }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      rejectionLetterJob: { findMany: jest.fn() },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    await expect(service.listApprovalQueue(user())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.rejectionLetterJob.findMany).not.toHaveBeenCalled();
  });

  it('denies an unauthorized user before changing official settings', async () => {
    const prisma = {
      rejectionLetterSettings: { findUnique: jest.fn() },
      rejectionLetterJob: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    await expect(
      service.saveSettings({} as never, user() as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a spoofed logo before saving official settings', async () => {
    const tx = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue({ version: 1 }),
        upsert: jest.fn().mockResolvedValue({ id: 'default' }),
      },
      rejectionLetterTemplate: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
    };
    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: officialSettings.activeHeadUserId }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const service = new RejectionLetterApprovalService(prisma as never);
    const admin = user({
      role: 'ADMIN',
      roles: ['ADMIN'],
      permissions: ['rekomtek.rejection-letter.manage'],
    });

    await expect(
      service.saveSettings(
        {
          ...officialSettings,
          logoDataUrl: 'data:image/png;base64,PHN2Zz48L3N2Zz4=',
        } as never,
        admin,
      ),
    ).rejects.toThrow('Logo hanya boleh berupa PNG atau JPEG yang valid');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns only active configured Kepala Bidang candidates to authorized admins', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'head-1',
            firstName: 'Kepala',
            lastName: 'Bidang',
            email: 'head@example.test',
          },
        ]),
      },
    };
    const service = new RejectionLetterApprovalService(prisma as never);
    const admin = user({
      role: 'ADMIN',
      roles: ['ADMIN'],
      permissions: ['rekomtek.rejection-letter.manage'],
    });

    const candidates = await service.listEligibleHeads(admin);

    expect(candidates).toEqual([
      {
        id: 'head-1',
        firstName: 'Kepala',
        lastName: 'Bidang',
        email: 'head@example.test',
      },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where: expect.objectContaining({ isActive: true }),
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  });

  it('versions and activates each supplied template in the settings transaction', async () => {
    const tx = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue({ version: 4 }),
        upsert: jest.fn().mockResolvedValue({ version: 5 }),
      },
      rejectionLetterTemplate: {
        findFirst: jest.fn().mockResolvedValue({ version: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'template-3', version: 3 }),
      },
      rejectionLetterJob: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: officialSettings.activeHeadUserId }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const admin = user({
      userId: 'admin-1',
      role: 'ADMIN',
      roles: ['ADMIN'],
      permissions: ['rekomtek.rejection-letter.manage'],
    });
    const service = new RejectionLetterApprovalService(prisma as never);

    await service.saveSettings(officialSettings as never, admin);

    expect(tx.rejectionLetterTemplate.updateMany).toHaveBeenCalledWith({
      where: {
        rekomtekType: 'APU',
        jenisPermohonan: 'IZIN_BARU',
        isActive: true,
      },
      data: { isActive: false },
    });
    expect(tx.rejectionLetterTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ version: 3, isActive: true }),
      }),
    );
  });

  it('pins waiting approval jobs to the previous template before activating a new version', async () => {
    const previousTemplate = {
      ...officialSettings.templates[0],
      version: 2,
      layoutConfig: {
        pageSize: 'A4',
        marginTopMm: 18,
        marginRightMm: 23,
        marginBottomMm: 20,
        marginLeftMm: 23,
        bodyFontSizePt: 10,
        bodyLineGapPt: 2,
        paragraphSpacingPt: 4,
        headerAlignment: 'CENTER',
        logoPosition: 'LEFT',
      },
    };
    const queuedAt = new Date('2026-10-08T10:00:00.000Z');
    const tx = {
      rejectionLetterSettings: {
        upsert: jest.fn().mockResolvedValue({ version: 5 }),
      },
      rejectionLetterTemplate: {
        findFirst: jest.fn().mockResolvedValue(previousTemplate),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'template-3', version: 3 }),
      },
      rejectionLetterJob: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'job-waiting', templateSnapshot: null, updatedAt: queuedAt },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: officialSettings.activeHeadUserId }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const admin = user({
      userId: 'admin-1',
      role: 'ADMIN',
      roles: ['ADMIN'],
      permissions: ['rekomtek.rejection-letter.manage'],
    });

    await new RejectionLetterApprovalService(prisma as never).saveSettings(
      officialSettings as never,
      admin,
    );

    expect(tx.rejectionLetterJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({ status: 'WAITING_APPROVAL' }),
      }),
    );
    expect(tx.rejectionLetterJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          id: 'job-waiting',
          status: 'WAITING_APPROVAL',
          updatedAt: queuedAt,
        }),
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          templateSnapshot: expect.objectContaining({
            version: 2,
            layoutConfig: resolveRejectionLetterLayoutConfig(
              previousTemplate.layoutConfig,
            ),
          }),
        },
      }),
    );
  });

  it('does not allocate a number without final PDF storage and workflow dependencies', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new RejectionLetterApprovalService(prisma as never);
    await expect(
      service.approveAndPreparePreview('job-1', {} as never, user() as never),
    ).rejects.toThrow(
      'Penyimpanan atau layanan workflow penerbitan belum tersedia',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('issues a new approval only after stored QR PDF verification and records final workflow with notifications', async () => {
    const previous = process.env.APP_URL;
    process.env.APP_URL = 'https://example.go.id';
    const { updatedAt, tx, storage, workflow, service, getBytes } =
      officialApprovalFixture();
    try {
      const result = await service.approveAndPreparePreview(
        'job-new',
        { expectedUpdatedAt: updatedAt.toISOString() },
        user(),
      );
      expect(result).toMatchObject({
        status: 'ISSUED',
        issuanceMethod: 'HEAD_APPROVAL_QR',
        isTestOnly: false,
        finalPdfAvailable: true,
      });
      expect(tx.rejectionLetterNumberSequence.upsert).toHaveBeenCalledTimes(1);
      const approvalWrite = (
        tx.rejectionLetterJob.updateMany.mock.calls[1] as unknown as [
          {
            data: {
              settingsSnapshot: {
                authorityStartsAt: unknown;
                authorityEndsAt: unknown;
              };
            };
          },
        ]
      )[0].data;
      expect(typeof approvalWrite.settingsSnapshot.authorityStartsAt).toBe(
        'string',
      );
      expect(typeof approvalWrite.settingsSnapshot.authorityEndsAt).toBe(
        'string',
      );
      expect(storage.readBuffer).toHaveBeenCalledWith('private/final.pdf');
      expect(getBytes().subarray(0, 5).toString('ascii')).toBe('%PDF-');
      const pdfText = extractPdfText(getBytes());
      const pdfLines = pdfText.split(/\r?\n/).map((line) => line.trim());
      expect(pdfLines).toContain('Kepala Bidang');
      expect(pdfLines).toContain('Nama Kepala Bidang');
      expect(pdfLines).toContain('NIP. 198001012000011001');
      expect(pdfText).not.toContain(
        'Persetujuan Kepala Bidang tercatat melalui SIPENGSUI',
      );
      expect(pdfText).not.toContain('PRATINJAU INTERNAL');
      expect(tx.rejectionLetterJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ISSUED',
            issuanceMethod: 'HEAD_APPROVAL_QR',
            isTestOnly: false,
            finalPdfStorageKey: 'private/final.pdf',
            signatureVerified: false,
            finalPdfChecksum: createHash('sha256')
              .update(getBytes())
              .digest('hex'),
          }) as unknown,
        }),
      );
      expect(
        workflow.transitionRejectionToIssuedInTransaction,
      ).toHaveBeenCalledWith(
        tx,
        'r-1',
        expect.objectContaining({ userId: 'head-1' }),
        expect.objectContaining({ isTestOnly: false }),
      );
      expect(tx.rekomtekArtifact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FINAL',
            storageKey: 'private/final.pdf',
            stage: 'DITOLAK',
            metadata: expect.objectContaining({ isTestOnly: false }) as unknown,
          }) as unknown,
        }),
      );
      expect(storage.remove).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous;
    }
  }, 120_000);

  it('aborts allocation if its approved snapshots cannot be persisted', async () => {
    const previous = process.env.APP_URL;
    process.env.APP_URL = 'https://example.go.id';
    try {
      const { updatedAt, tx, storage, workflow, service } =
        officialApprovalFixture();
      tx.rejectionLetterJob.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      await expect(
        service.approveAndPreparePreview(
          'job-new',
          { expectedUpdatedAt: updatedAt.toISOString() },
          user() as never,
        ),
      ).rejects.toThrow(/snapshot|berubah/i);
      expect(storage.storeGeneratedPdf).not.toHaveBeenCalled();
      expect(
        workflow.transitionRejectionToIssuedInTransaction,
      ).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous;
    }
  }, 120_000);

  describe('official issuance safety gates', () => {
    let previous: string | undefined;
    beforeEach(() => {
      previous = process.env.APP_URL;
      process.env.APP_URL = 'https://example.go.id';
    });
    afterEach(() => {
      if (previous === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous;
    });

    it.each([
      [
        'evaluation marker',
        {
          evaluationSnapshot: {
            summarySource: 'USER_AUTHORIZED_LOCAL_TEST_BACKFILL_NOT_ORIGINAL',
          },
        },
      ],
      [
        'backfill event',
        { events: [{ action: 'BACKFILL_LOCAL_TEST_REJECTION_JOB' }] },
      ],
      ['dummy number', { outgoingNumber: '1/KODE-UJI/REKOMTEK-UJI/2026' }],
      ['test-only job', { isTestOnly: true }],
    ])('never reserves an official number for %s', async (_label, mutation) => {
      const { job, prisma, tx, service, updatedAt } = officialApprovalFixture();
      prisma.rejectionLetterJob.findUnique.mockResolvedValue({
        ...job,
        ...mutation,
      });
      await expect(
        service.approveAndPreparePreview(
          'job-new',
          { expectedUpdatedAt: updatedAt.toISOString() },
          user() as never,
        ),
      ).rejects.toThrow(/uji|backfill/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.rejectionLetterNumberSequence.upsert).not.toHaveBeenCalled();
    });

    it.each([
      [
        'local APP_URL',
        (settings: ReturnType<typeof officialApprovalFixture>['settings']) => {
          void settings;
          process.env.APP_URL = 'http://localhost:3001';
        },
      ],
      [
        'wrong public origin',
        (settings: ReturnType<typeof officialApprovalFixture>['settings']) => {
          void settings;
          process.env.APP_URL = 'https://other.go.id';
        },
      ],
      [
        'private HTTPS address',
        (settings: ReturnType<typeof officialApprovalFixture>['settings']) => {
          settings.verificationDomain = 'https://192.168.1.20';
          process.env.APP_URL = 'https://192.168.1.20';
        },
      ],
      [
        'missing logo',
        (settings: ReturnType<typeof officialApprovalFixture>['settings']) => {
          settings.logoDataUrl = '';
        },
      ],
      [
        'missing NIP',
        (settings: ReturnType<typeof officialApprovalFixture>['settings']) => {
          settings.activeHeadNip = '';
        },
      ],
      [
        'dummy format',
        (settings: ReturnType<typeof officialApprovalFixture>['settings']) => {
          settings.classificationCode = 'KODE-UJI';
        },
      ],
    ])('rejects %s before allocation', async (_label, invalidate) => {
      const { settings, prisma, service, updatedAt } =
        officialApprovalFixture();
      invalidate(settings);
      await expect(
        service.approveAndPreparePreview(
          'job-new',
          { expectedUpdatedAt: updatedAt.toISOString() },
          user() as never,
        ),
      ).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fails on missing Arial fonts before touching the official number register', async () => {
      const { prisma, service, updatedAt } = officialApprovalFixture();
      const previousFont = process.env.REJECTION_LETTER_ARIAL_BOLD_PATH;
      process.env.REJECTION_LETTER_ARIAL_BOLD_PATH = join(
        tmpdir(),
        'missing-approval-arial-bold.ttf',
      );
      try {
        await expect(
          service.approveAndPreparePreview(
            'job-new',
            { expectedUpdatedAt: updatedAt.toISOString() },
            user(),
          ),
        ).rejects.toThrow(/Arial/);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      } finally {
        if (previousFont === undefined)
          delete process.env.REJECTION_LETTER_ARIAL_BOLD_PATH;
        else process.env.REJECTION_LETTER_ARIAL_BOLD_PATH = previousFont;
      }
    });
  });

  it('keeps the number and retries a checksum failure without a second allocation', async () => {
    const previous = process.env.APP_URL;
    process.env.APP_URL = 'https://example.go.id';
    try {
      const {
        updatedAt,
        job,
        settings,
        tx,
        prisma,
        storage,
        workflow,
        service,
      } = officialApprovalFixture();
      storage.readBuffer.mockResolvedValueOnce(
        Buffer.from('%PDF-1.7\ntampered'),
      );
      prisma.rejectionLetterJob.findUnique
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce({ finalPdfStorageKey: null });
      await expect(
        service.approveAndPreparePreview(
          'job-new',
          { expectedUpdatedAt: updatedAt.toISOString() },
          user() as never,
        ),
      ).rejects.toThrow(/tidak cocok/);
      expect(prisma.rejectionLetterJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }) as unknown,
        }),
      );
      expect(storage.remove).toHaveBeenCalledWith('private/final.pdf');
      expect(
        workflow.transitionRejectionToIssuedInTransaction,
      ).not.toHaveBeenCalled();
      const snap = (
        tx.rejectionLetterJob.updateMany.mock.calls[1] as unknown as [
          { data: Record<string, unknown> },
        ]
      )[0].data;
      prisma.rejectionLetterJob.findUnique.mockResolvedValue({
        ...job,
        status: 'FAILED',
        outgoingNumber: '1/600.1/2026',
        outgoingDate: new Date(),
        approvedAt: new Date(),
        approvedById: 'head-1',
        settingsSnapshot: settings,
        signerSnapshot: snap.signerSnapshot,
        templateSnapshot: snap.templateSnapshot,
      });
      await expect(
        service.approveAndPreparePreview(
          'job-new',
          { expectedUpdatedAt: updatedAt.toISOString() },
          user() as never,
        ),
      ).resolves.toMatchObject({
        status: 'ISSUED',
        outgoingNumber: '1/600.1/2026',
      });
      expect(tx.rejectionLetterJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: 'ISSUED',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            approvalSnapshot: expect.objectContaining({
              publicSubject: 'Penolakan RKT/001/2026',
              documentType: 'SURAT PENOLAKAN',
            }),
          }),
        }),
      );
      expect(tx.rejectionLetterNumberSequence.upsert).toHaveBeenCalledTimes(1);
      expect(tx.rekomtekArtifact.create).toHaveBeenCalledTimes(1);
      expect(
        workflow.transitionRejectionToIssuedInTransaction,
      ).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous;
    }
  }, 120_000);

  it('publishes a marked local test job with its existing number and no notification', async () => {
    const job = {
      id: 'job-test',
      status: 'BLOCKED_TTE',
      rekomtekId: 'rekomtek-test',
      approvedById: 'head-1',
      approvedAt: new Date('2026-10-08T05:11:59.000Z'),
      issuedAt: null,
      outgoingNumber: '1/KODE-UJI/REKOMTEK-UJI/2026',
      outgoingDate: new Date('2026-10-08T05:11:59.000Z'),
      verificationTokenHash: 'old-token-hash',
      preparedPdfStorageKey: 'generated/preview.pdf',
      preparedPdfChecksum: 'preview-checksum',
      finalPdfChecksum: null,
      finalPdfStorageKey: null,
      signatureVerified: false,
      applicantSnapshot: {
        applicationNumber: 'REK-TEST-1',
        applicationTitle: 'Permohonan Uji',
        applicationType: 'APU / IZIN_BARU',
        applicantName: 'Pemohon Uji',
        applicantOrganization: 'Perusahaan Uji',
        applicantAddress: 'Alamat Uji',
      },
      evaluationSnapshot: {
        summary: 'Ringkasan uji lokal.',
        summarySource: 'USER_AUTHORIZED_LOCAL_TEST_BACKFILL_NOT_ORIGINAL',
        findings: [{ requirement: '01 Berkas Uji', note: 'Temuan uji.' }],
      },
      settingsSnapshot: {
        ...officialSettings,
        activeHeadUserId: 'head-1',
        verificationDomain: 'https://example.go.id',
      },
      templateSnapshot: {
        ...officialSettings.templates[0],
        version: 1,
      },
      signerSnapshot: {
        userId: 'head-1',
        name: 'Nama Kepala Bidang',
        position: 'Kepala Bidang',
        nip: null,
      },
      events: [{ action: 'BACKFILL_LOCAL_TEST_REJECTION_JOB' }],
      rekomtek: {
        nomor: 'REK-TEST-1',
        judul: 'Permohonan Uji',
        jenis: 'APU',
        jenisPermohonan: 'IZIN_BARU',
        workflowStage: 'PENYUSUNAN_SURAT_PENOLAKAN',
      },
    };
    const testSettings = {
      ...officialSettings,
      activeHeadUserId: 'head-1',
      authorityStartsAt: new Date('2026-01-01T00:00:00.000Z'),
      authorityEndsAt: new Date('2026-12-31T23:59:59.000Z'),
    };
    const updateMany = jest
      .fn<Promise<{ count: number }>, [Record<string, unknown>]>()
      .mockResolvedValue({ count: 1 });
    const createArtifact = jest
      .fn<Promise<{ id: string }>, [Record<string, unknown>]>()
      .mockResolvedValue({ id: 'qr-test-artifact' });
    const transitionInWorkflow = jest
      .fn<
        Promise<{ id: string; workflowStage: string }>,
        [
          unknown,
          string,
          { userId: string },
          { isTestOnly: boolean },
          { suppressNotifications: boolean },
        ]
      >()
      .mockResolvedValue({ id: 'rekomtek-test', workflowStage: 'DITOLAK' });
    const tx = {
      rejectionLetterJob: {
        updateMany,
      },
      rejectionLetterJobEvent: {
        create: jest.fn().mockResolvedValue({ id: 'qr-test-event' }),
      },
      rekomtekArtifact: {
        aggregate: jest.fn().mockResolvedValue({ _max: { version: 0 } }),
        create: createArtifact,
      },
    };
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue(testSettings),
      },
      rejectionLetterJob: {
        findUnique: jest.fn().mockResolvedValue(job),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    let storedPdf = Buffer.alloc(0);
    const storage = {
      storeGeneratedPdf: jest.fn((buffer: Buffer) => {
        storedPdf = buffer;
        return Promise.resolve('generated/qr-test.pdf');
      }),
      readBuffer: jest.fn(() => Promise.resolve(storedPdf)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const workflowService = {
      transitionRejectionToIssuedInTransaction: transitionInWorkflow,
    };
    const service = new RejectionLetterApprovalService(
      prisma as never,
      storage as never,
      workflowService as never,
    );

    const previousAppUrl = process.env.APP_URL;
    process.env.APP_URL = 'http://localhost:3001';
    let result: Awaited<ReturnType<typeof service.publishLocalQrTestJob>>;
    try {
      result = await service.publishLocalQrTestJob('job-test', user());
    } finally {
      if (previousAppUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previousAppUrl;
    }

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ISSUED',
        isTestOnly: true,
        outgoingNumber: job.outgoingNumber,
        notificationSent: false,
      }),
    );
    expect(storedPdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(storedPdf.length).toBeGreaterThan(1000);
    const jobUpdate = tx.rejectionLetterJob.updateMany.mock.calls[0]?.[0];
    expect(jobUpdate).toMatchObject({
      where: {
        id: 'job-test',
        status: 'BLOCKED_TTE',
        outgoingNumber: job.outgoingNumber,
      },
      data: {
        status: 'ISSUED',
        issuanceMethod: 'HEAD_APPROVAL_QR',
        isTestOnly: true,
        finalPdfStorageKey: 'generated/qr-test.pdf',
        signatureVerified: false,
      },
    });
    expect(tx.rejectionLetterNumberSequence).toBeUndefined();
    const transitionArgs =
      workflowService.transitionRejectionToIssuedInTransaction.mock.calls[0];
    expect(transitionArgs[1]).toBe('rekomtek-test');
    expect(transitionArgs[2].userId).toBe('head-1');
    expect(transitionArgs[3].isTestOnly).toBe(true);
    expect(transitionArgs[4].suppressNotifications).toBe(true);
    const artifactCreate = tx.rekomtekArtifact.create.mock.calls[0]?.[0];
    expect(artifactCreate).toMatchObject({
      data: {
        type: 'SURAT_PENOLAKAN',
        status: 'FINAL',
        stage: 'DITOLAK',
        storageKey: 'generated/qr-test.pdf',
        metadata: { isTestOnly: true },
      },
    });
    expect(artifactCreate?.data).toHaveProperty('fileName');
  }, 120_000);

  it('rejects local QR conversion when a different Head approved the job', async () => {
    const settings = {
      ...officialSettings,
      activeHeadUserId: 'current-head',
      authorityStartsAt: new Date('2026-01-01T00:00:00.000Z'),
      authorityEndsAt: new Date('2026-12-31T23:59:59.000Z'),
    };
    const job = {
      id: 'job-test',
      rekomtekId: 'rekomtek-test',
      status: 'BLOCKED_TTE',
      approvedAt: new Date('2026-10-08T05:12:00.000Z'),
      approvedById: 'previous-head',
      outgoingNumber: '1/KODE-UJI/REKOMTEK-UJI/2026',
      outgoingDate: new Date('2026-10-08T00:00:00.000Z'),
      issuedAt: null,
      updatedAt: new Date('2026-10-08T05:12:00.000Z'),
      preparedPdfStorageKey: 'generated/preview.pdf',
      preparedPdfChecksum: 'preview-checksum',
      applicantSnapshot: {
        applicationNumber: 'REK-UJI-1',
        applicationTitle: 'Permohonan uji',
        applicationType: 'APU / IZIN_BARU',
        applicantName: 'Pemohon Uji',
      },
      evaluationSnapshot: {
        summarySource: 'USER_AUTHORIZED_LOCAL_TEST_BACKFILL_NOT_ORIGINAL',
        summary: 'Ringkasan lokal untuk uji, bukan teks evaluator asli.',
        findings: [{ requirement: 'Dokumen uji', note: 'Temuan uji.' }],
      },
      settingsSnapshot: officialSettings,
      templateSnapshot: { ...officialSettings.templates[0], version: 1 },
      signerSnapshot: { name: 'Nama Kepala Bidang', position: 'Kepala Bidang' },
      events: [{ action: 'BACKFILL_LOCAL_TEST_REJECTION_JOB' }],
      rekomtek: {
        nomor: 'REK-UJI-1',
        judul: 'Permohonan uji',
        jenis: 'APU',
        jenisPermohonan: 'IZIN_BARU',
        workflowStage: 'PENYUSUNAN_SURAT_PENOLAKAN',
      },
    };
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue(settings),
      },
      rejectionLetterJob: { findUnique: jest.fn().mockResolvedValue(job) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'current-head' }) },
      $transaction: jest.fn(),
    };
    const storage = {
      storeGeneratedPdf: jest.fn(),
      readBuffer: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const workflowService = {
      transitionRejectionToIssuedInTransaction: jest.fn(),
    };
    const service = new RejectionLetterApprovalService(
      prisma as never,
      storage as never,
      workflowService as never,
    );
    const previousAppUrl = process.env.APP_URL;
    process.env.APP_URL = 'http://localhost:3001';
    try {
      await expect(
        service.publishLocalQrTestJob(
          'job-test',
          user({ userId: 'current-head' }) as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      if (previousAppUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previousAppUrl;
    }
    expect(storage.storeGeneratedPdf).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('previews a complete draft without reserving an outgoing number', async () => {
    const settings = {
      ...officialSettings,
      activeHeadUserId: 'head-1',
      authorityStartsAt: new Date('2000-01-01T00:00:00.000Z'),
      authorityEndsAt: new Date('2100-12-31T23:59:59.000Z'),
    };
    const job = {
      id: 'job-1',
      status: 'WAITING_APPROVAL',
      updatedAt: new Date('2026-10-07T06:00:00.000Z'),
      templateSnapshot: {
        ...officialSettings.templates[0],
        version: 2,
        bodyTemplate:
          'VERSI TERSIMPAN {{companyName}} {{applicationNumber}} {{applicationTitle}} {{applicationType}} {{evaluationSummary}} {{rejectionReasons}}',
      },
      applicantSnapshot: {
        applicationNumber: 'RKT/001/2026',
        applicationTitle: 'Pemanfaatan air',
        applicationType: 'APU / IZIN_BARU',
        applicantName: 'Siti Aminah',
        applicantOrganization: 'PT Air',
        applicantAddress: 'Bandung',
      },
      evaluationSnapshot: {
        summary: 'Tidak memenuhi',
        findings: [{ requirement: '01 Dokumen teknis', note: 'Belum lengkap' }],
      },
      rekomtek: {
        nomor: 'RKT/001/2026',
        judul: 'Pemanfaatan air',
        jenis: 'APU',
        jenisPermohonan: 'IZIN_BARU',
      },
    };
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue(settings),
      },
      rejectionLetterJob: { findUnique: jest.fn().mockResolvedValue(job) },
      rejectionLetterTemplate: {
        findFirst: jest.fn().mockResolvedValue(officialSettings.templates[0]),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
      rejectionLetterNumberSequence: { upsert: jest.fn() },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    const preview = await service.getApprovalPreview('job-1', user());

    expect(preview.numberAllocated).toBe(false);
    expect(preview.outgoingNumber).toBeNull();
    expect(preview.draft!.subject).toContain('RKT/001/2026');
    expect(preview.draft!.body).toContain('VERSI TERSIMPAN');
    expect(preview.draft!.body).toContain('Belum lengkap');
    expect(prisma.rejectionLetterTemplate.findFirst).not.toHaveBeenCalled();
    expect(prisma.rejectionLetterNumberSequence.upsert).not.toHaveBeenCalled();
  });

  it('exposes QR test publication only for an approved marked backfill job', async () => {
    const settings = {
      ...officialSettings,
      activeHeadUserId: 'head-1',
      authorityStartsAt: new Date('2026-01-01T00:00:00.000Z'),
      authorityEndsAt: new Date('2026-12-31T23:59:59.000Z'),
    };
    const job = {
      id: 'job-test',
      status: 'BLOCKED_TTE',
      updatedAt: new Date('2026-10-08T05:12:00.000Z'),
      approvedAt: new Date('2026-10-08T05:11:59.000Z'),
      issuedAt: null,
      outgoingNumber: '1/KODE-UJI/REKOMTEK-UJI/2026',
      preparedPdfStorageKey: 'generated/preview.pdf',
      preparedPdfChecksum: 'preview-checksum',
      evaluationSnapshot: {
        summarySource: 'USER_AUTHORIZED_LOCAL_TEST_BACKFILL_NOT_ORIGINAL',
      },
      events: [{ action: 'BACKFILL_LOCAL_TEST_REJECTION_JOB' }],
      rekomtek: {
        nomor: 'REK-TEST-1',
        judul: 'Permohonan Uji',
        jenis: 'APU',
        jenisPermohonan: 'IZIN_BARU',
      },
    };
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue(settings),
      },
      rejectionLetterJob: { findUnique: jest.fn().mockResolvedValue(job) },
      rejectionLetterTemplate: { findFirst: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    const preview = await service.getApprovalPreview('job-test', user());

    expect(preview).toEqual(
      expect.objectContaining({
        status: 'BLOCKED_TTE',
        testQrPublishAvailable: true,
        outgoingNumber: job.outgoingNumber,
      }),
    );
    expect(prisma.rejectionLetterTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('returns the final QR test PDF status for an issued local-only job', async () => {
    const settings = {
      ...officialSettings,
      activeHeadUserId: 'head-1',
      authorityStartsAt: new Date('2026-01-01T00:00:00.000Z'),
      authorityEndsAt: new Date('2026-12-31T23:59:59.000Z'),
    };
    const job = {
      id: 'job-test',
      status: 'ISSUED',
      isTestOnly: true,
      issuanceMethod: 'HEAD_APPROVAL_QR',
      updatedAt: new Date('2026-10-08T05:12:00.000Z'),
      outgoingNumber: '1/KODE-UJI/REKOMTEK-UJI/2026',
      finalPdfStorageKey: 'generated/qr-test.pdf',
      finalPdfChecksum: 'final-checksum',
      rekomtek: {
        nomor: 'REK-TEST-1',
        judul: 'Permohonan Uji',
        jenis: 'APU',
        jenisPermohonan: 'IZIN_BARU',
      },
    };
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue(settings),
      },
      rejectionLetterJob: { findUnique: jest.fn().mockResolvedValue(job) },
      rejectionLetterTemplate: { findFirst: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    const preview = await service.getApprovalPreview('job-test', user());

    expect(preview).toEqual(
      expect.objectContaining({
        status: 'ISSUED',
        isTestOnly: true,
        issuanceMethod: 'HEAD_APPROVAL_QR',
        finalPdfAvailable: true,
        finalPdfChecksum: 'final-checksum',
      }),
    );
  });

  it('shows an issued official job and serves its checked final PDF to the Head', async () => {
    const pdf = Buffer.from('%PDF-1.7\nfinal official\n%%EOF');
    const checksum = createHash('sha256').update(pdf).digest('hex');
    const job = {
      id: 'job-official',
      status: 'ISSUED',
      issuanceMethod: 'HEAD_APPROVAL_QR',
      isTestOnly: false,
      outgoingNumber: '1/600.1/2026',
      finalPdfStorageKey: 'private/official.pdf',
      finalPdfChecksum: checksum,
      updatedAt: new Date(),
      rekomtek: { jenis: 'APU', jenisPermohonan: 'IZIN_BARU' },
    };
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue({
          ...officialSettings,
          activeHeadUserId: 'head-1',
          authorityStartsAt: new Date('2000-01-01'),
          authorityEndsAt: new Date('2100-01-01'),
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
      rejectionLetterJob: { findUnique: jest.fn().mockResolvedValue(job) },
    };
    const storage = { readBuffer: jest.fn().mockResolvedValue(pdf) };
    const service = new RejectionLetterApprovalService(
      prisma as never,
      storage as never,
    );
    await expect(
      service.getApprovalPreview(job.id, user() as never),
    ).resolves.toMatchObject({
      status: 'ISSUED',
      finalPdfAvailable: true,
      isTestOnly: false,
      finalPdfChecksum: checksum,
    });
    await expect(
      service.getPreparedPreview(job.id, user() as never),
    ).resolves.toMatchObject({
      buffer: pdf,
      isTestOnly: false,
      status: 'ISSUED',
      fileName: 'Surat-Penolakan.pdf',
    });
  });

  it('returns only a minimal not-issued status for a public opaque token', async () => {
    const token = 'A'.repeat(43);
    const prisma = {
      rejectionLetterJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          status: 'BLOCKED_TTE',
          outgoingNumber: '8/600.1/2026',
          outgoingDate: new Date('2026-10-07T00:00:00.000Z'),
          preparedPdfChecksum: 'preview-checksum',
          finalPdfChecksum: null,
          signatureVerified: false,
          settingsSnapshot: { institutionName: 'Dinas Contoh' },
          signerSnapshot: { name: 'Kepala Bidang', position: 'Kepala Bidang' },
          applicantSnapshot: {
            applicantName: 'Nama pribadi yang tidak boleh keluar',
          },
        }),
      },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    const result = await service.getPublicVerification(token);

    expect(result.status).toBe('NOT_ISSUED');
    expect(result.officiallyIssued).toBe(false);
    expect(result.letterNumber).toBe('8/600.1/2026');
    expect(JSON.stringify(result)).not.toContain('Nama pribadi');
    expect(result).not.toHaveProperty('preparedPdfChecksum');
    expect(result).not.toHaveProperty('signerName');
    expect(prisma.rejectionLetterJob.findUnique).toHaveBeenCalledWith({
      where: {
        verificationTokenHash: hashRejectionLetterVerificationToken(token),
      },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      select: expect.any(Object),
    });
  });

  it('returns the issued letter subject and type for QR verification without applicant data', async () => {
    const token = 'D'.repeat(43);
    const prisma = {
      rejectionLetterJob: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ISSUED',
          issuanceMethod: 'HEAD_APPROVAL_QR',
          isTestOnly: false,
          outgoingNumber: '8/600.1/2026',
          issuedAt: new Date('2026-10-08T05:12:00.000Z'),
          finalPdfChecksum: 'final-checksum',
          signatureVerified: false,
          settingsSnapshot: { institutionName: 'Dinas Sumber Daya Air' },
          approvalSnapshot: {
            name: 'Kepala Bidang',
            position: 'Kepala Bidang',
            publicSubject: 'Penolakan Permohonan 8/600.1/2026',
            documentType: 'SURAT PENOLAKAN',
            applicantName: 'Nama pribadi yang tidak boleh keluar',
          },
        }),
      },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    const result = await service.getPublicVerification(token);

    expect(result).toMatchObject({
      status: 'VALID',
      officiallyIssued: true,
      letterNumber: '8/600.1/2026',
      institutionName: 'Dinas Sumber Daya Air',
      subject: 'Penolakan Permohonan 8/600.1/2026',
      documentType: 'SURAT PENOLAKAN',
    });
    expect(result.message).toContain('cocok dengan data surat resmi');
    expect(JSON.stringify(result)).not.toContain('Nama pribadi');
  });

  it('redacts applicant identity and address from the public letter subject', () => {
    expect(
      publicRejectionLetterSubject(
        'Penolakan untuk PT. Contoh+ — oleh Nama (Pemohon) di Jalan [Rahasia] 1',
        {
          applicantName: 'Nama (Pemohon)',
          applicantOrganization: 'PT. Contoh+',
          applicantAddress: 'Jalan [Rahasia] 1',
        },
      ),
    ).toBe('Penolakan untuk Pemohon — oleh Pemohon di Pemohon');

    expect(
      publicRejectionLetterSubject(
        'Penolakan  untuk\nPT. Contoh+\t— oleh Nama (Pemohon)  di Jalan [Rahasia] 1',
        {
          applicantName: 'Nama (Pemohon)',
          applicantOrganization: 'PT. Contoh+',
          applicantAddress: 'Jalan [Rahasia] 1',
        },
      ),
    ).toBe('Penolakan untuk Pemohon — oleh Pemohon di Pemohon');
  });

  it('keeps local QR test publication distinguishable in public verification', async () => {
    const token = 'C'.repeat(43);
    const prisma = {
      rejectionLetterJob: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ISSUED',
          issuanceMethod: 'HEAD_APPROVAL_QR',
          isTestOnly: true,
          outgoingNumber: '1/KODE-UJI/REKOMTEK-UJI/2026',
          outgoingDate: new Date('2026-10-08T05:11:59.000Z'),
          issuedAt: new Date('2026-10-08T05:12:00.000Z'),
          preparedPdfChecksum: 'preview-checksum',
          finalPdfChecksum: 'test-final-checksum',
          signatureVerified: false,
          settingsSnapshot: { institutionName: 'Dinas Uji' },
          approvalSnapshot: {
            name: 'Kepala Bidang Uji',
            position: 'Kepala Bidang',
          },
          signerSnapshot: null,
        }),
      },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    const result = await service.getPublicVerification(token);

    expect(result.status).toBe('TEST_ONLY');
    expect(result.officiallyIssued).toBe(false);
    expect(result.issuanceMethod).toBe('HEAD_APPROVAL_QR');
    expect(result.isTestOnly).toBe(true);
    expect(result.message).toContain('bukan surat resmi');
    expect(result.message).not.toContain('TTE terverifikasi');
    expect(result).not.toHaveProperty('signerName');
  });

  it('never labels a checksum-matching unsigned preview as an official document', async () => {
    const token = 'B'.repeat(43);
    const previewPdf = Buffer.from('%PDF-1.7\ninternal preview\n%%EOF');
    const checksum = createHash('sha256').update(previewPdf).digest('hex');
    const prisma = {
      rejectionLetterJob: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'BLOCKED_TTE',
          outgoingNumber: '8/600.1/2026',
          preparedPdfChecksum: checksum,
          finalPdfChecksum: null,
          signatureVerified: false,
        }),
      },
    };
    const service = new RejectionLetterApprovalService(prisma as never);

    const result = await service.verifyPublicFile(token, previewPdf);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'PREVIEW_ONLY',
        officiallyIssued: false,
      }),
    );
    expect(result.message).toContain('belum ditandatangani');
  });

  it('serves a prepared preview only after checking its recorded checksum', async () => {
    const pdf = Buffer.from('%PDF-1.7\npreview\n%%EOF');
    const checksum = createHash('sha256').update(pdf).digest('hex');
    const storage = { readBuffer: jest.fn().mockResolvedValue(pdf) };
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue({
          activeHeadUserId: 'head-1',
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
      rejectionLetterJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          status: 'BLOCKED_TTE',
          outgoingNumber: '8/600.1/2026',
          preparedPdfStorageKey: 'generated/preview.pdf',
          preparedPdfChecksum: checksum,
        }),
      },
    };
    const service = new RejectionLetterApprovalService(
      prisma as never,
      storage as never,
    );

    const result = await service.getPreparedPreview('job-1', user());

    expect(result.buffer).toEqual(pdf);
    expect(result.fileName).toBe('Pratinjau-Surat-Penolakan.pdf');
    expect(storage.readBuffer).toHaveBeenCalledWith('generated/preview.pdf');
  });

  it('serves a published local QR test PDF from the final storage key', async () => {
    const pdf = Buffer.from('%PDF-1.7\nlocal QR test\n%%EOF');
    const checksum = createHash('sha256').update(pdf).digest('hex');
    const storage = { readBuffer: jest.fn().mockResolvedValue(pdf) };
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue({
          activeHeadUserId: 'head-1',
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
      rejectionLetterJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-test',
          status: 'ISSUED',
          isTestOnly: true,
          issuanceMethod: 'HEAD_APPROVAL_QR',
          outgoingNumber: '1/KODE-UJI/REKOMTEK-UJI/2026',
          finalPdfStorageKey: 'generated/qr-test.pdf',
          finalPdfChecksum: checksum,
        }),
      },
    };
    const service = new RejectionLetterApprovalService(
      prisma as never,
      storage as never,
    );

    const result = await service.getPreparedPreview('job-test', user());

    expect(result).toEqual(
      expect.objectContaining({
        buffer: pdf,
        fileName: 'UJI-LOKAL-Surat-Penolakan.pdf',
        status: 'ISSUED',
        isTestOnly: true,
      }),
    );
    expect(storage.readBuffer).toHaveBeenCalledWith('generated/qr-test.pdf');
  });

  it('rejects a prepared preview whose stored bytes no longer match the checksum', async () => {
    const storage = {
      readBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7\nchanged')),
    };
    const prisma = {
      rejectionLetterSettings: {
        findUnique: jest.fn().mockResolvedValue({ activeHeadUserId: 'head-1' }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'head-1' }) },
      rejectionLetterJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          status: 'BLOCKED_TTE',
          preparedPdfStorageKey: 'generated/preview.pdf',
          preparedPdfChecksum: '0'.repeat(64),
        }),
      },
    };
    const service = new RejectionLetterApprovalService(
      prisma as never,
      storage as never,
    );

    await expect(service.getPreparedPreview('job-1', user())).rejects.toThrow(
      /checksum pratinjau tidak cocok/i,
    );
  });

  it('lets the owning applicant download a clearly marked draft while approval is pending', async () => {
    const storage = { readBuffer: jest.fn() };
    const prisma = {
      rejectionLetterJob: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'WAITING_APPROVAL',
          applicantSnapshot: {
            applicationNumber: 'RKT/001/2026',
            applicationTitle: 'Pemanfaatan air',
            applicationType: 'APU / IZIN_BARU',
            applicantName: 'Siti Aminah',
            applicantOrganization: 'PT Air',
            applicantAddress: 'Bandung',
          },
          evaluationSnapshot: {
            summary: 'Masih belum memenuhi.',
            findings: [
              { requirement: 'Dokumen teknis', note: 'Peta belum lengkap.' },
            ],
          },
          rekomtek: { createdById: 'applicant-1' },
        }),
      },
    };
    const service = new RejectionLetterApprovalService(
      prisma as never,
      storage as never,
    );

    const result = await service.getApplicantPreparedPreview(
      'rekomtek-1',
      user({ userId: 'applicant-1', role: 'USER', roles: ['USER'] }),
    );

    expect(result.status).toBe('WAITING_APPROVAL');
    expect(result.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.fileName).toBe('Draf-Surat-Penolakan.pdf');
    expect(storage.readBuffer).not.toHaveBeenCalled();
  });

  it('allows only the owning applicant to download their prepared rejection-letter draft', async () => {
    const pdf = Buffer.from('%PDF-1.7\nowned draft\n%%EOF');
    const checksum = createHash('sha256').update(pdf).digest('hex');
    const storage = { readBuffer: jest.fn().mockResolvedValue(pdf) };
    const prisma = {
      rejectionLetterJob: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'BLOCKED_TTE',
          preparedPdfStorageKey: 'generated/preview.pdf',
          preparedPdfChecksum: checksum,
          rekomtek: { createdById: 'applicant-1' },
        }),
      },
    };
    const service = new RejectionLetterApprovalService(
      prisma as never,
      storage as never,
    );
    const applicant = user({
      userId: 'applicant-1',
      role: 'USER',
      roles: ['USER'],
      permissions: ['rekomtek.read'],
    });

    const result = await service.getApplicantPreparedPreview(
      'rekomtek-1',
      applicant,
    );

    expect(result.buffer).toEqual(pdf);
    expect(result.fileName).toBe('Draf-Surat-Penolakan.pdf');
    expect(storage.readBuffer).toHaveBeenCalledWith('generated/preview.pdf');
  });

  it('denies an applicant from another request without reading the private PDF', async () => {
    const storage = { readBuffer: jest.fn() };
    const prisma = {
      rejectionLetterJob: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'BLOCKED_TTE',
          preparedPdfStorageKey: 'generated/preview.pdf',
          preparedPdfChecksum: '0'.repeat(64),
          rekomtek: { createdById: 'owner-1' },
        }),
      },
    };
    const service = new RejectionLetterApprovalService(
      prisma as never,
      storage as never,
    );

    await expect(
      service.getApplicantPreparedPreview(
        'rekomtek-1',
        user({ userId: 'other-user', role: 'USER', roles: ['USER'] }) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.readBuffer).not.toHaveBeenCalled();
  });
});
