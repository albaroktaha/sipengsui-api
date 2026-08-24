import { NewsStatus } from '@prisma/client';

import { sanitizeNewsHtml } from './news-html';
import { NewsService } from './news.service';
import { NewsStorageService } from './news-storage.service';

describe('NewsService', () => {
  function createPrismaMock() {
    return {
      newsArticle: {
        count: jest.fn(),
        aggregate: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      newsArticleRevision: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      newsCategory: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      newsTag: { count: jest.fn() },
    };
  }

  it('deduplicates anonymous views by the first-party 30 minute cookie', async () => {
    const prisma = createPrismaMock();
    prisma.newsArticle.findUnique
      .mockResolvedValueOnce({
        id: 'article-1',
        status: NewsStatus.PUBLISHED,
        viewCount: 7,
      })
      .mockResolvedValueOnce({
        id: 'article-1',
        status: NewsStatus.PUBLISHED,
        viewCount: 8,
      });
    prisma.newsArticle.update.mockResolvedValue({});
    const service = new NewsService(prisma as never);

    const first = await service.recordView('berita-hari-ini', undefined);
    const second = await service.recordView(
      'berita-hari-ini',
      'sipengsui-news-view-article-1=1',
    );

    expect(first).toMatchObject({ counted: true, viewCount: 8 });
    expect(second).toMatchObject({ counted: false, viewCount: 8 });
    expect(prisma.newsArticle.update).toHaveBeenCalledTimes(1);
  });

  it('claims scheduled rows with a conditional database update before publishing', async () => {
    const prisma = createPrismaMock();
    prisma.newsArticle.findMany.mockResolvedValue([
      { id: 'article-1' },
      { id: 'article-2' },
    ]);
    prisma.newsArticle.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const service = new NewsService(prisma as never);
    const publish = jest.spyOn(service, 'publish').mockResolvedValue({});

    await service.publishScheduled();

    expect(prisma.newsArticle.updateMany).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith('article-1');
    expect(prisma.newsArticle.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'article-1', status: NewsStatus.SCHEDULED },
      data: { status: NewsStatus.DRAFT },
    });
  });

  it('returns the persisted status and total view metrics', async () => {
    const prisma = createPrismaMock();
    prisma.newsArticle.count.mockImplementation(
      ({ where }: { where: { status?: NewsStatus; isFeatured?: boolean } }) => {
        if (where.status === NewsStatus.DRAFT) return Promise.resolve(2);
        if (where.status === NewsStatus.SCHEDULED) return Promise.resolve(1);
        if (where.status === NewsStatus.PUBLISHED && where.isFeatured)
          return Promise.resolve(1);
        if (where.status === NewsStatus.PUBLISHED) return Promise.resolve(4);
        if (where.status === NewsStatus.ARCHIVED) return Promise.resolve(3);
        return Promise.resolve(0);
      },
    );
    prisma.newsArticle.aggregate.mockResolvedValue({ _sum: { viewCount: 99 } });
    const service = new NewsService(prisma as never);

    await expect(service.getStats()).resolves.toEqual({
      draft: 2,
      scheduled: 1,
      published: 4,
      archived: 3,
      featured: 1,
      totalViews: 99,
    });
  });
});

describe('News HTML and storage hardening', () => {
  it('removes scripts, iframes, and unsafe protocols from editor HTML', () => {
    const result = sanitizeNewsHtml(
      '<p>Aman</p><script>alert(1)</script><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)">tautan</a>',
    );
    expect(result).toContain('<p>Aman</p>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('javascript:');
  });

  it('rejects missing and unsupported upload files before storage access', async () => {
    const storage = new NewsStorageService();
    await expect(storage.uploadImage(undefined as never)).rejects.toThrow(
      'File gambar wajib diunggah',
    );
    await expect(
      storage.uploadImage({
        mimetype: 'application/pdf',
        size: 10,
        buffer: Buffer.from('x'),
      } as never),
    ).rejects.toThrow('Format gambar harus JPEG, PNG, atau WebP');
  });
});
