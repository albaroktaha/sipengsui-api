import { PETUGAS_WORKFLOW_PERMISSION_SLUGS } from './rekomtek-permission-policy';

describe('Rekomtek permission policy', () => {
  it('allows Petugas to upload and issue a final rejection letter', () => {
    expect(PETUGAS_WORKFLOW_PERMISSION_SLUGS).toEqual(
      expect.arrayContaining(['rekomtek.artifact', 'rekomtek.reject']),
    );
  });
});
