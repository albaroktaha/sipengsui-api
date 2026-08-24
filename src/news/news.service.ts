import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NewsStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { formatUserDisplayName } from '../users/user-name.util';
import { CreateNewsDto, UpdateNewsDto } from './dto/create-news.dto';
import {
  CreateCategoryDto,
  CreateTagDto,
  MergeTagDto,
  ScheduleNewsDto,
  UpdateCategoryDto,
  UpdateTagDto,
} from './dto/category-tag.dto';
import { PublicNewsQueryDto, QueryNewsDto } from './dto/query-news.dto';
import { sanitizeNewsHtml } from './news-html';

const listInclude = {
  author: { select: { id: true, firstName: true, lastName: true, email: true } },
  category: true,
  tags: { include: { tag: true } },
} as const;

const detailInclude = {
  ...listInclude,
  revisions: {
    orderBy: { version: 'desc' as const },
    take: 10,
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
} as const;

type ArticleSnapshot = {
  title: string;
  slug: string;
  excerpt: string | null;
  contentJson: Prisma.InputJsonValue;
  contentHtml: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  coverImageCaption: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  categoryId: string | null;
  tagIds: string[];
  scheduledAt: Date | null;
};

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryNewsDto) {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.prisma.newsArticle.findMany({
        where,
        include: listInclude,
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.newsArticle.count({ where }),
    ]);

    return {
      data: data.map((article) => this.serializeArticle(article)),
      meta: this.pagination(total, query.page, query.limit),
    };
  }

  async findOne(id: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { id },
      include: detailInclude,
    });

    if (!article) {
      throw new NotFoundException('Berita tidak ditemukan');
    }

    return this.serializeArticle(article);
  }

  async getStats() {
    const [draft, scheduled, published, archived, views, featured] =
      await Promise.all([
        this.prisma.newsArticle.count({ where: { status: NewsStatus.DRAFT } }),
        this.prisma.newsArticle.count({
          where: { status: NewsStatus.SCHEDULED },
        }),
        this.prisma.newsArticle.count({
          where: { status: NewsStatus.PUBLISHED },
        }),
        this.prisma.newsArticle.count({
          where: { status: NewsStatus.ARCHIVED },
        }),
        this.prisma.newsArticle.aggregate({ _sum: { viewCount: true } }),
        this.prisma.newsArticle.count({
          where: { status: NewsStatus.PUBLISHED, isFeatured: true },
        }),
      ]);

    return {
      draft,
      scheduled,
      published,
      archived,
      featured,
      totalViews: views._sum.viewCount ?? 0,
    };
  }

  async create(dto: CreateNewsDto, authorId: string) {
    await this.assertCategory(dto.categoryId);
    await this.assertTags(dto.tagIds ?? []);

    const slug = await this.assertAvailableSlug(dto.slug || dto.title);
    const status = dto.scheduledAt
      ? NewsStatus.SCHEDULED
      : (dto.status ?? NewsStatus.DRAFT);

    if (status === NewsStatus.PUBLISHED || status === NewsStatus.ARCHIVED) {
      throw new BadRequestException(
        'Gunakan endpoint workflow untuk menerbitkan atau mengarsipkan berita',
      );
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    this.assertSchedule(status, scheduledAt);

    const snapshot = this.snapshotFromDto(dto, {
      title: dto.title,
      slug,
      status,
      scheduledAt,
    });
    this.assertCoverAlt(snapshot);

    const article = await this.prisma.$transaction(async (tx) => {
      if (dto.isFeatured) {
        await tx.newsArticle.updateMany({
          where: { isFeatured: true, status: { not: NewsStatus.ARCHIVED } },
          data: { isFeatured: false },
        });
      }

      const created = await tx.newsArticle.create({
        data: {
          title: snapshot.title,
          slug: snapshot.slug,
          excerpt: snapshot.excerpt,
          contentJson: snapshot.contentJson,
          contentHtml: snapshot.contentHtml,
          coverImageUrl: snapshot.coverImageUrl,
          coverImageAlt: snapshot.coverImageAlt,
          coverImageCaption: snapshot.coverImageCaption,
          seoTitle: snapshot.seoTitle,
          seoDescription: snapshot.seoDescription,
          canonicalUrl: snapshot.canonicalUrl,
          status,
          isFeatured: dto.isFeatured ?? false,
          scheduledAt: snapshot.scheduledAt,
          author: { connect: { id: authorId } },
          category: snapshot.categoryId
            ? { connect: { id: snapshot.categoryId } }
            : undefined,
          tags: {
            create: snapshot.tagIds.map((tagId) => ({
              tag: { connect: { id: tagId } },
            })),
          },
        },
      });

      await this.createRevisionTx(
        tx,
        created.id,
        snapshot,
        authorId,
        true,
        'Versi awal',
      );
      return tx.newsArticle.findUnique({
        where: { id: created.id },
        include: detailInclude,
      });
    });

    return this.serializeArticle(article);
  }

  async update(id: string, dto: UpdateNewsDto, userId: string) {
    const current = await this.getRawArticle(id);
    const currentTags = current.tags.map((entry) => entry.tagId);
    const existingDraft = await this.getLatestDraft(id);
    const source =
      current.status === NewsStatus.PUBLISHED && existingDraft
        ? this.snapshotFromRevision(existingDraft)
        : this.snapshotFromArticle(current, currentTags);
    const snapshot = this.mergeSnapshot(source, dto);

    await this.assertCategory(snapshot.categoryId);
    await this.assertTags(snapshot.tagIds);
    await this.assertAvailableSlug(snapshot.slug, id);
    this.assertCoverAlt(snapshot);

    if (current.status === NewsStatus.PUBLISHED) {
      const article = await this.prisma.$transaction(async (tx) => {
        if (dto.isFeatured !== undefined) {
          if (dto.isFeatured) {
            await tx.newsArticle.updateMany({
              where: {
                id: { not: id },
                isFeatured: true,
                status: { not: NewsStatus.ARCHIVED },
              },
              data: { isFeatured: false },
            });
          }
          await tx.newsArticle.update({
            where: { id },
            data: { isFeatured: dto.isFeatured },
          });
        }

        await this.createRevisionTx(
          tx,
          id,
          snapshot,
          userId,
          true,
          dto.autosave ? 'Autosave' : 'Perubahan artikel terbit',
          dto.autosave,
        );
        return tx.newsArticle.findUnique({
          where: { id },
          include: detailInclude,
        });
      });

      return this.serializeArticle(article);
    }

    const status = this.resolveUpdateStatus(
      current.status,
      dto.status,
      snapshot.scheduledAt,
    );
    if (
      status === NewsStatus.DRAFT &&
      dto.status === NewsStatus.DRAFT &&
      dto.scheduledAt === undefined
    ) {
      snapshot.scheduledAt = null;
    }
    this.assertSchedule(status, snapshot.scheduledAt);

    const article = await this.prisma.$transaction(async (tx) => {
      if (dto.isFeatured) {
        await tx.newsArticle.updateMany({
          where: {
            id: { not: id },
            isFeatured: true,
            status: { not: NewsStatus.ARCHIVED },
          },
          data: { isFeatured: false },
        });
      }

      await tx.newsArticle.update({
        where: { id },
        data: {
          title: snapshot.title,
          slug: snapshot.slug,
          excerpt: snapshot.excerpt,
          contentJson: snapshot.contentJson,
          contentHtml: snapshot.contentHtml,
          coverImageUrl: snapshot.coverImageUrl,
          coverImageAlt: snapshot.coverImageAlt,
          coverImageCaption: snapshot.coverImageCaption,
          seoTitle: snapshot.seoTitle,
          seoDescription: snapshot.seoDescription,
          canonicalUrl: snapshot.canonicalUrl,
          category: snapshot.categoryId
            ? { connect: { id: snapshot.categoryId } }
            : { disconnect: true },
          tags: {
            deleteMany: {},
            create: snapshot.tagIds.map((tagId) => ({
              tag: { connect: { id: tagId } },
            })),
          },
          status,
          scheduledAt: snapshot.scheduledAt,
          archivedAt:
            status === NewsStatus.ARCHIVED ? current.archivedAt : null,
          isFeatured: dto.isFeatured ?? current.isFeatured,
        },
      });

      await this.createRevisionTx(
        tx,
        id,
        snapshot,
        userId,
        true,
        dto.autosave ? 'Autosave' : 'Perubahan artikel',
        dto.autosave,
      );
      return tx.newsArticle.findUnique({
        where: { id },
        include: detailInclude,
      });
    });

    return this.serializeArticle(article);
  }

  async publish(id: string) {
    const current = await this.getRawArticle(id);
    const draft = await this.getLatestDraft(id);
    const snapshot = draft
      ? this.snapshotFromRevision(draft)
      : this.snapshotFromArticle(
          current,
          current.tags.map((entry) => entry.tagId),
        );

    await this.assertCategory(snapshot.categoryId);
    await this.assertTags(snapshot.tagIds);
    this.assertCoverAlt(snapshot);
    await this.assertAvailableSlug(snapshot.slug, id);

    const publishedAt = new Date();
    const article = await this.prisma.$transaction(async (tx) => {
      if (snapshot.slug !== current.slug) {
        const oldRedirect = await tx.newsSlugRedirect.findUnique({
          where: { fromSlug: current.slug },
        });
        if (oldRedirect && oldRedirect.articleId !== id) {
          throw new ConflictException(
            `Slug lama '${current.slug}' sudah digunakan sebagai redirect`,
          );
        }
        await tx.newsSlugRedirect.upsert({
          where: { fromSlug: current.slug },
          update: { articleId: id },
          create: { articleId: id, fromSlug: current.slug },
        });
      }

      if (current.isFeatured) {
        await tx.newsArticle.updateMany({
          where: {
            id: { not: id },
            isFeatured: true,
            status: NewsStatus.PUBLISHED,
          },
          data: { isFeatured: false },
        });
      }

      await tx.newsArticle.update({
        where: { id },
        data: {
          title: snapshot.title,
          slug: snapshot.slug,
          excerpt: snapshot.excerpt,
          contentJson: snapshot.contentJson,
          contentHtml: snapshot.contentHtml,
          coverImageUrl: snapshot.coverImageUrl,
          coverImageAlt: snapshot.coverImageAlt,
          coverImageCaption: snapshot.coverImageCaption,
          seoTitle: snapshot.seoTitle,
          seoDescription: snapshot.seoDescription,
          canonicalUrl: snapshot.canonicalUrl,
          category: snapshot.categoryId
            ? { connect: { id: snapshot.categoryId } }
            : { disconnect: true },
          tags: {
            deleteMany: {},
            create: snapshot.tagIds.map((tagId) => ({
              tag: { connect: { id: tagId } },
            })),
          },
          status: NewsStatus.PUBLISHED,
          scheduledAt: null,
          publishedAt,
          archivedAt: null,
        },
      });

      await tx.newsArticleRevision.updateMany({
        where: { articleId: id, isDraft: true },
        data: { isDraft: false, publishedAt },
      });

      return tx.newsArticle.findUnique({
        where: { id },
        include: detailInclude,
      });
    });

    return this.serializeArticle(article);
  }

  async schedule(id: string, dto: ScheduleNewsDto) {
    const article = await this.getRawArticle(id);
    if (article.status === NewsStatus.PUBLISHED) {
      throw new BadRequestException(
        'Artikel terbit diedit sebagai revisi draft, bukan dijadwalkan ulang langsung',
      );
    }

    const scheduledAt = new Date(dto.scheduledAt);
    this.assertSchedule(NewsStatus.SCHEDULED, scheduledAt);

    return this.prisma.newsArticle
      .update({
        where: { id },
        data: { status: NewsStatus.SCHEDULED, scheduledAt, archivedAt: null },
        include: detailInclude,
      })
      .then((result) => this.serializeArticle(result));
  }

  async archive(id: string) {
    await this.getRawArticle(id);
    const result = await this.prisma.newsArticle.update({
      where: { id },
      data: {
        status: NewsStatus.ARCHIVED,
        archivedAt: new Date(),
        isFeatured: false,
      },
      include: detailInclude,
    });
    return this.serializeArticle(result);
  }

  async restore(id: string) {
    const article = await this.getRawArticle(id);
    const result = await this.prisma.newsArticle.update({
      where: { id },
      data: {
        status: NewsStatus.DRAFT,
        archivedAt: null,
        scheduledAt: null,
        isFeatured: false,
        publishedAt: article.publishedAt,
      },
      include: detailInclude,
    });
    return this.serializeArticle(result);
  }

  async getRevisions(id: string) {
    await this.getRawArticle(id);
    const revisions = await this.prisma.newsArticleRevision.findMany({
      where: { articleId: id },
      orderBy: { version: 'desc' },
      take: 10,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return revisions.map((revision) => ({
      ...revision,
      createdBy: {
        ...revision.createdBy,
        displayName: formatUserDisplayName(
          revision.createdBy.firstName,
          revision.createdBy.lastName,
        ),
      },
    }));
  }

  async rollback(id: string, revisionId: string, userId: string) {
    const article = await this.getRawArticle(id);
    const revision = await this.prisma.newsArticleRevision.findFirst({
      where: { id: revisionId, articleId: id },
    });
    if (!revision) {
      throw new NotFoundException('Revisi berita tidak ditemukan');
    }

    const snapshot = this.snapshotFromRevision(revision);
    await this.assertCategory(snapshot.categoryId);
    await this.assertTags(snapshot.tagIds);
    await this.assertAvailableSlug(snapshot.slug, id);
    this.assertCoverAlt(snapshot);

    const result = await this.prisma.$transaction(async (tx) => {
      if (article.status === NewsStatus.PUBLISHED) {
        await this.createRevisionTx(
          tx,
          id,
          snapshot,
          userId,
          true,
          `Rollback ke versi ${revision.version}`,
        );
        return tx.newsArticle.findUnique({
          where: { id },
          include: detailInclude,
        });
      }

      await tx.newsArticle.update({
        where: { id },
        data: {
          title: snapshot.title,
          slug: snapshot.slug,
          excerpt: snapshot.excerpt,
          contentJson: snapshot.contentJson,
          contentHtml: snapshot.contentHtml,
          coverImageUrl: snapshot.coverImageUrl,
          coverImageAlt: snapshot.coverImageAlt,
          coverImageCaption: snapshot.coverImageCaption,
          seoTitle: snapshot.seoTitle,
          seoDescription: snapshot.seoDescription,
          canonicalUrl: snapshot.canonicalUrl,
          category: snapshot.categoryId
            ? { connect: { id: snapshot.categoryId } }
            : { disconnect: true },
          tags: {
            deleteMany: {},
            create: snapshot.tagIds.map((tagId) => ({
              tag: { connect: { id: tagId } },
            })),
          },
          scheduledAt: snapshot.scheduledAt,
        },
      });
      await this.createRevisionTx(
        tx,
        id,
        snapshot,
        userId,
        true,
        `Rollback ke versi ${revision.version}`,
      );
      return tx.newsArticle.findUnique({
        where: { id },
        include: detailInclude,
      });
    });

    return this.serializeArticle(result);
  }

  async publishScheduled() {
    const due = await this.prisma.newsArticle.findMany({
      where: { status: NewsStatus.SCHEDULED, scheduledAt: { lte: new Date() } },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });

    for (const article of due) {
      // Conditional update menjadi DB guard agar dua instance scheduler tidak
      // menerbitkan artikel yang sama pada menit yang sama.
      const claimed = await this.prisma.newsArticle.updateMany({
        where: {
          id: article.id,
          status: NewsStatus.SCHEDULED,
          scheduledAt: { lte: new Date() },
        },
        data: { status: NewsStatus.DRAFT },
      });
      if (claimed.count !== 1) continue;

      try {
        await this.publish(article.id);
      } catch (error) {
        // Satu artikel bermasalah tidak boleh menghentikan scheduler untuk artikel lain.
        console.error(`[news] gagal menerbitkan jadwal ${article.id}`, error);
        await this.prisma.newsArticle.updateMany({
          where: { id: article.id, status: NewsStatus.DRAFT },
          data: { status: NewsStatus.SCHEDULED },
        });
      }
    }

    return { processed: due.length };
  }

  async findCategories() {
    return this.prisma.newsCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const slug = await this.assertAvailableCategorySlug(dto.slug || dto.name);
    return this.prisma.newsCategory.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.getCategory(id);
    const slug = dto.slug
      ? await this.assertAvailableCategorySlug(dto.slug, id)
      : undefined;
    return this.prisma.newsCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(slug !== undefined && { slug }),
        ...(dto.description !== undefined && {
          description: dto.description.trim() || null,
        }),
      },
    });
  }

  async removeCategory(id: string) {
    await this.getCategory(id);
    const used = await this.prisma.newsArticle.count({
      where: { categoryId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        'Kategori yang masih dipakai berita tidak dapat dihapus',
      );
    }
    return this.prisma.newsCategory.delete({ where: { id } });
  }

  async findTags() {
    return this.prisma.newsTag.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createTag(dto: CreateTagDto) {
    const slug = await this.assertAvailableTagSlug(dto.slug || dto.name);
    return this.prisma.newsTag.create({
      data: { name: dto.name.trim(), slug },
    });
  }

  async updateTag(id: string, dto: UpdateTagDto) {
    await this.getTag(id);
    const slug = dto.slug
      ? await this.assertAvailableTagSlug(dto.slug, id)
      : undefined;
    return this.prisma.newsTag.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(slug !== undefined && { slug }),
      },
    });
  }

  async removeTag(id: string) {
    await this.getTag(id);
    const used = await this.prisma.newsArticleTag.count({
      where: { tagId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        'Tag yang masih dipakai berita tidak dapat dihapus; gunakan merge tag',
      );
    }
    return this.prisma.newsTag.delete({ where: { id } });
  }

  async mergeTag(id: string, dto: MergeTagDto) {
    if (id === dto.targetTagId) {
      throw new BadRequestException('Tag sumber dan target harus berbeda');
    }
    await this.getTag(id);
    await this.getTag(dto.targetTagId);

    const usages = await this.prisma.newsArticleTag.findMany({
      where: { tagId: id },
      select: { articleId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      for (const usage of usages) {
        await tx.newsArticleTag.delete({
          where: { articleId_tagId: { articleId: usage.articleId, tagId: id } },
        });
        await tx.newsArticleTag.upsert({
          where: {
            articleId_tagId: {
              articleId: usage.articleId,
              tagId: dto.targetTagId,
            },
          },
          update: {},
          create: { articleId: usage.articleId, tagId: dto.targetTagId },
        });
      }
      await tx.newsTag.update({ where: { id }, data: { isActive: false } });
    });

    return {
      merged: id,
      into: dto.targetTagId,
      affectedArticles: usages.length,
    };
  }

  async getPublicList(query: PublicNewsQueryDto) {
    const where: Prisma.NewsArticleWhereInput = {
      status: NewsStatus.PUBLISHED,
      ...(query.q?.trim() && {
        OR: [
          { title: { contains: query.q.trim(), mode: 'insensitive' } },
          { excerpt: { contains: query.q.trim(), mode: 'insensitive' } },
        ],
      }),
      ...(query.category && {
        category: { slug: query.category, isActive: true },
      }),
    };
    const skip = (query.page - 1) * query.limit;

    const [articles, total, featured] = await Promise.all([
      this.prisma.newsArticle.findMany({
        where,
        include: listInclude,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.newsArticle.count({ where }),
      this.prisma.newsArticle.findFirst({
        where: { status: NewsStatus.PUBLISHED, isFeatured: true },
        include: listInclude,
        orderBy: { publishedAt: 'desc' },
      }),
    ]);

    return {
      data: articles.map((article) => this.serializeArticle(article)),
      featured: featured ? this.serializeArticle(featured) : null,
      meta: this.pagination(total, query.page, query.limit),
    };
  }

  async getPublicArticle(slug: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { slug },
      include: listInclude,
    });

    if (article?.status === NewsStatus.ARCHIVED) {
      throw new GoneException('Berita ini sudah diarsipkan');
    }

    if (article?.status === NewsStatus.PUBLISHED) {
      const related = await this.findRelated(
        article.id,
        article.categoryId,
        article.tags.map((entry) => entry.tagId),
      );
      return {
        article: this.serializeArticle(article),
        related: related.map((item) => this.serializeArticle(item)),
      };
    }

    const redirect = await this.prisma.newsSlugRedirect.findUnique({
      where: { fromSlug: slug },
      include: { article: { select: { slug: true, status: true } } },
    });
    if (redirect?.article.status === NewsStatus.PUBLISHED) {
      return { redirectSlug: redirect.article.slug };
    }

    throw new NotFoundException('Berita tidak ditemukan');
  }

  async recordView(slug: string, cookieHeader?: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { slug },
      select: { id: true, status: true, viewCount: true },
    });
    if (!article || article.status !== NewsStatus.PUBLISHED) {
      throw new NotFoundException('Berita tidak ditemukan');
    }

    const cookieName = `sipengsui-news-view-${article.id}`;
    const counted = !this.hasCookie(cookieHeader, cookieName);
    if (counted) {
      await this.prisma.newsArticle.update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      });
    }

    return {
      counted,
      cookieName,
      viewCount: article.viewCount + (counted ? 1 : 0),
    };
  }

  private buildWhere(query: QueryNewsDto): Prisma.NewsArticleWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q?.trim() && {
        OR: [
          { title: { contains: query.q.trim(), mode: 'insensitive' } },
          { excerpt: { contains: query.q.trim(), mode: 'insensitive' } },
        ],
      }),
      ...(query.category && { category: { slug: query.category } }),
      ...(query.tag && { tags: { some: { tag: { slug: query.tag } } } }),
    };
  }

  private async findRelated(
    id: string,
    categoryId: string | null,
    tagIds: string[],
  ) {
    if (!categoryId && tagIds.length === 0) return [];

    return this.prisma.newsArticle.findMany({
      where: {
        id: { not: id },
        status: NewsStatus.PUBLISHED,
        OR: [
          ...(categoryId ? [{ categoryId }] : []),
          ...(tagIds.length > 0
            ? [{ tags: { some: { tagId: { in: tagIds } } } }]
            : []),
        ],
      },
      include: listInclude,
      orderBy: { publishedAt: 'desc' },
      take: 3,
    });
  }

  private async getRawArticle(id: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { id },
      include: { tags: true },
    });
    if (!article) throw new NotFoundException('Berita tidak ditemukan');
    return article;
  }

  private async getLatestDraft(id: string) {
    return this.prisma.newsArticleRevision.findFirst({
      where: { articleId: id, isDraft: true },
      orderBy: { version: 'desc' },
    });
  }

  private snapshotFromDto(
    dto: CreateNewsDto,
    values: {
      title: string;
      slug: string;
      status: NewsStatus;
      scheduledAt: Date | null;
    },
  ): ArticleSnapshot {
    return {
      title: values.title.trim(),
      slug: values.slug,
      excerpt: dto.excerpt?.trim() || null,
      contentJson: dto.contentJson as unknown as Prisma.InputJsonValue,
      contentHtml: sanitizeNewsHtml(dto.contentHtml || ''),
      coverImageUrl: dto.coverImageUrl?.trim() || null,
      coverImageAlt: dto.coverImageAlt?.trim() || null,
      coverImageCaption: dto.coverImageCaption?.trim() || null,
      seoTitle: dto.seoTitle?.trim() || null,
      seoDescription: dto.seoDescription?.trim() || null,
      canonicalUrl: dto.canonicalUrl?.trim() || null,
      categoryId: dto.categoryId ?? null,
      tagIds: [...new Set(dto.tagIds ?? [])],
      scheduledAt: values.scheduledAt,
    };
  }

  private snapshotFromArticle(article: any, tagIds: string[]): ArticleSnapshot {
    return {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      contentJson: article.contentJson as Prisma.InputJsonValue,
      contentHtml: article.contentHtml,
      coverImageUrl: article.coverImageUrl,
      coverImageAlt: article.coverImageAlt,
      coverImageCaption: article.coverImageCaption,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      canonicalUrl: article.canonicalUrl,
      categoryId: article.categoryId,
      tagIds: [...new Set(tagIds)],
      scheduledAt: article.scheduledAt,
    };
  }

  private snapshotFromRevision(revision: any): ArticleSnapshot {
    return {
      title: revision.title,
      slug: revision.slug,
      excerpt: revision.excerpt,
      contentJson: revision.contentJson as Prisma.InputJsonValue,
      contentHtml: revision.contentHtml,
      coverImageUrl: revision.coverImageUrl,
      coverImageAlt: revision.coverImageAlt,
      coverImageCaption: revision.coverImageCaption,
      seoTitle: revision.seoTitle,
      seoDescription: revision.seoDescription,
      canonicalUrl: revision.canonicalUrl,
      categoryId: revision.categoryId,
      tagIds: this.asTagIds(revision.tagIds),
      scheduledAt: revision.scheduledAt,
    };
  }

  private mergeSnapshot(
    source: ArticleSnapshot,
    dto: UpdateNewsDto,
  ): ArticleSnapshot {
    const result = { ...source };
    if (dto.title !== undefined) result.title = dto.title.trim();
    if (dto.slug !== undefined) result.slug = slugify(dto.slug);
    if (dto.excerpt !== undefined) result.excerpt = dto.excerpt.trim() || null;
    if (dto.contentJson !== undefined)
      result.contentJson = dto.contentJson as unknown as Prisma.InputJsonValue;
    if (dto.contentHtml !== undefined)
      result.contentHtml = sanitizeNewsHtml(dto.contentHtml || '');
    if (dto.categoryId !== undefined)
      result.categoryId = dto.categoryId || null;
    if (dto.tagIds !== undefined) result.tagIds = [...new Set(dto.tagIds)];
    if (dto.coverImageUrl !== undefined)
      result.coverImageUrl = dto.coverImageUrl?.trim() || null;
    if (dto.coverImageAlt !== undefined)
      result.coverImageAlt = dto.coverImageAlt?.trim() || null;
    if (dto.coverImageCaption !== undefined)
      result.coverImageCaption = dto.coverImageCaption?.trim() || null;
    if (dto.seoTitle !== undefined)
      result.seoTitle = dto.seoTitle?.trim() || null;
    if (dto.seoDescription !== undefined)
      result.seoDescription = dto.seoDescription?.trim() || null;
    if (dto.canonicalUrl !== undefined)
      result.canonicalUrl = dto.canonicalUrl?.trim() || null;
    if (dto.scheduledAt !== undefined)
      result.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    return result;
  }

  private resolveUpdateStatus(
    current: NewsStatus,
    requested: NewsStatus | undefined,
    scheduledAt: Date | null,
  ): NewsStatus {
    if (current === NewsStatus.ARCHIVED) return NewsStatus.ARCHIVED;
    if (
      requested === NewsStatus.PUBLISHED ||
      requested === NewsStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        'Gunakan endpoint workflow untuk status tersebut',
      );
    }
    if (requested === NewsStatus.SCHEDULED || scheduledAt)
      return NewsStatus.SCHEDULED;
    if (requested === NewsStatus.DRAFT) return NewsStatus.DRAFT;
    return current;
  }

  private assertSchedule(status: NewsStatus, scheduledAt: Date | null) {
    if (
      status === NewsStatus.SCHEDULED &&
      (!scheduledAt || Number.isNaN(scheduledAt.getTime()))
    ) {
      throw new BadRequestException(
        'Waktu terbit wajib diisi untuk berita terjadwal',
      );
    }
    if (
      status === NewsStatus.SCHEDULED &&
      scheduledAt &&
      scheduledAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Waktu terbit harus berada di masa depan');
    }
  }

  private assertCoverAlt(snapshot: ArticleSnapshot) {
    if (snapshot.coverImageUrl && !snapshot.coverImageAlt) {
      throw new BadRequestException(
        'Alt text wajib diisi saat berita memakai gambar sampul',
      );
    }
  }

  private async createRevisionTx(
    tx: Prisma.TransactionClient,
    articleId: string,
    snapshot: ArticleSnapshot,
    createdById: string,
    isDraft: boolean,
    note: string,
    updateDraft = false,
  ) {
    const latestDraft = updateDraft
      ? await tx.newsArticleRevision.findFirst({
          where: { articleId, isDraft: true },
          orderBy: { version: 'desc' },
        })
      : null;

    if (latestDraft) {
      return tx.newsArticleRevision.update({
        where: { id: latestDraft.id },
        data: {
          title: snapshot.title,
          slug: snapshot.slug,
          excerpt: snapshot.excerpt,
          contentJson: snapshot.contentJson,
          contentHtml: snapshot.contentHtml,
          coverImageUrl: snapshot.coverImageUrl,
          coverImageAlt: snapshot.coverImageAlt,
          coverImageCaption: snapshot.coverImageCaption,
          seoTitle: snapshot.seoTitle,
          seoDescription: snapshot.seoDescription,
          canonicalUrl: snapshot.canonicalUrl,
          categoryId: snapshot.categoryId,
          tagIds: snapshot.tagIds,
          scheduledAt: snapshot.scheduledAt,
          createdById,
          note,
        },
      });
    }

    const latest = await tx.newsArticleRevision.findFirst({
      where: { articleId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const created = await tx.newsArticleRevision.create({
      data: {
        articleId,
        version: (latest?.version ?? 0) + 1,
        isDraft,
        title: snapshot.title,
        slug: snapshot.slug,
        excerpt: snapshot.excerpt,
        contentJson: snapshot.contentJson,
        contentHtml: snapshot.contentHtml,
        coverImageUrl: snapshot.coverImageUrl,
        coverImageAlt: snapshot.coverImageAlt,
        coverImageCaption: snapshot.coverImageCaption,
        seoTitle: snapshot.seoTitle,
        seoDescription: snapshot.seoDescription,
        canonicalUrl: snapshot.canonicalUrl,
        categoryId: snapshot.categoryId,
        tagIds: snapshot.tagIds,
        scheduledAt: snapshot.scheduledAt,
        note,
        createdById,
      },
    });

    const oldRevisions = await tx.newsArticleRevision.findMany({
      where: { articleId },
      orderBy: { version: 'desc' },
      skip: 10,
      select: { id: true },
    });
    if (oldRevisions.length > 0) {
      await tx.newsArticleRevision.deleteMany({
        where: { id: { in: oldRevisions.map((revision) => revision.id) } },
      });
    }
    return created;
  }

  private async assertCategory(categoryId?: string | null) {
    if (!categoryId) return;
    const category = await this.prisma.newsCategory.findFirst({
      where: { id: categoryId, isActive: true },
    });
    if (!category)
      throw new BadRequestException(
        'Kategori berita tidak ditemukan atau tidak aktif',
      );
  }

  private async assertTags(tagIds: string[]) {
    if (tagIds.length === 0) return;
    const count = await this.prisma.newsTag.count({
      where: { id: { in: tagIds }, isActive: true },
    });
    if (count !== new Set(tagIds).size)
      throw new BadRequestException(
        'Salah satu tag berita tidak ditemukan atau tidak aktif',
      );
  }

  private async assertAvailableSlug(value: string, ignoreId?: string) {
    const slug = slugify(value);
    if (!slug) throw new BadRequestException('Slug berita tidak boleh kosong');
    const existing = await this.prisma.newsArticle.findUnique({
      where: { slug },
    });
    if (existing && existing.id !== ignoreId)
      throw new ConflictException(`Slug '${slug}' sudah digunakan`);
    return slug;
  }

  private async assertAvailableCategorySlug(value: string, ignoreId?: string) {
    const slug = slugify(value);
    const existing = await this.prisma.newsCategory.findUnique({
      where: { slug },
    });
    if (existing && existing.id !== ignoreId)
      throw new ConflictException(`Slug kategori '${slug}' sudah digunakan`);
    return slug;
  }

  private async assertAvailableTagSlug(value: string, ignoreId?: string) {
    const slug = slugify(value);
    const existing = await this.prisma.newsTag.findUnique({ where: { slug } });
    if (existing && existing.id !== ignoreId)
      throw new ConflictException(`Slug tag '${slug}' sudah digunakan`);
    return slug;
  }

  private async getCategory(id: string) {
    const category = await this.prisma.newsCategory.findUnique({
      where: { id },
    });
    if (!category)
      throw new NotFoundException('Kategori berita tidak ditemukan');
    return category;
  }

  private async getTag(id: string) {
    const tag = await this.prisma.newsTag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag berita tidak ditemukan');
    return tag;
  }

  private serializeArticle(article: any) {
    if (!article) return article;
    const author = article.author
      ? {
          ...article.author,
          name:
            typeof article.author.firstName === 'string'
              ? formatUserDisplayName(
                  article.author.firstName,
                  article.author.lastName,
                )
              : article.author.name,
        }
      : article.author;
    const revisions = Array.isArray(article.revisions)
      ? article.revisions.map((revision: any) => ({
          ...revision,
          createdBy: revision.createdBy
            ? {
                ...revision.createdBy,
                displayName:
                  typeof revision.createdBy.firstName === 'string'
                    ? formatUserDisplayName(
                        revision.createdBy.firstName,
                        revision.createdBy.lastName,
                      )
                    : revision.createdBy.displayName,
              }
            : revision.createdBy,
        }))
      : article.revisions;
    const draftRevision = Array.isArray(revisions)
      ? (revisions.find((revision: any) => revision.isDraft) ?? null)
      : null;
    return {
      ...article,
      author,
      revisions,
      draftRevision,
      tags: Array.isArray(article.tags)
        ? article.tags.map((entry: any) => entry.tag ?? entry)
        : [],
    };
  }

  private pagination(total: number, page: number, limit: number) {
    return {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private asTagIds(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  private hasCookie(header: string | undefined, name: string) {
    return (header ?? '')
      .split(';')
      .some((part) => part.trim().startsWith(`${name}=1`));
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}
