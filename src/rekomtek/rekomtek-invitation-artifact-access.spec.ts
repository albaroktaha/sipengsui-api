import { ForbiddenException } from '@nestjs/common';
import {
  BerkasTechnicalStatus,
  RekomtekArtifactStatus,
  RekomtekArtifactType,
  RekomtekWorkflowStage,
} from '@prisma/client';
import { RekomtekWorkflowService } from './rekomtek-workflow.service';

function makeService() {
  const prisma = {
    rekomtekArtifact: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'artifact-1',
        type: RekomtekArtifactType.UNDANGAN_EKSPOSE,
        status: RekomtekArtifactStatus.FINAL,
        technicalStatus: BerkasTechnicalStatus.VALID,
        storageKey: 'active/rekomtek/invitation.pdf',
        mimeType: 'application/pdf',
        fileName: 'invitation.pdf',
      }),
    },
    rekomtekExposeSchedule: {
      findFirst: jest.fn().mockResolvedValue({
        participants: ['owner-1', 'participant-1'],
        responsibleUserId: 'responsible-1',
      }),
    },
  };
  const storage = {
    getFile: jest.fn().mockResolvedValue({
      stream: {},
      size: 123,
    }),
  };
  const service = new RekomtekWorkflowService(
    prisma as never,
    {} as never,
    storage as never,
    {} as never,
  );
  const serviceWithLoader = service as unknown as {
    loadRecord: jest.Mock;
  };
  serviceWithLoader.loadRecord = jest.fn().mockResolvedValue({
    id: 'rekomtek-1',
    createdById: 'owner-1',
    workflowStage: RekomtekWorkflowStage.EKSPOSE_TERJADWAL,
    workflowVersion: 2,
  });
  return { service, prisma, storage };
}

function user(userId: string) {
  return {
    userId,
    email: `${userId}@example.test`,
    role: 'USER',
    roles: ['USER'],
    permissions: ['rekomtek.read'],
  };
}

describe('RekomtekWorkflowService invitation artifact access', () => {
  it('allows a listed schedule participant to download final invitation artifact', async () => {
    const { service, storage } = makeService();

    await expect(
      service.getArtifactFile(
        'rekomtek-1',
        'artifact-1',
        user('participant-1'),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        fileName: 'invitation.pdf',
        mimeType: 'application/pdf',
        size: 123,
      }),
    );
    expect(storage.getFile).toHaveBeenCalledWith(
      'active/rekomtek/invitation.pdf',
    );
  });

  it('rejects a user who is not the owner or a listed participant', async () => {
    const { service } = makeService();

    await expect(
      service.getArtifactFile('rekomtek-1', 'artifact-1', user('other-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
