import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { PublicNewsQueryDto } from './dto/query-news.dto';
import { NewsService } from './news.service';

@ApiTags('Public News')
@Controller('public/news')
export class PublicNewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Daftar kategori berita publik' })
  categories() {
    return this.newsService.findCategories();
  }

  @Get()
  @ApiOperation({
    summary: 'Daftar berita terbit dengan search, filter, dan pagination',
  })
  list(@Query() query: PublicNewsQueryDto) {
    return this.newsService.getPublicList(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Detail berita terbit berdasarkan slug' })
  detail(@Param('slug') slug: string) {
    return this.newsService.getPublicArticle(slug);
  }

  @Post(':slug/view')
  @ApiOperation({ summary: 'Catat page view unik per browser selama 30 menit' })
  async view(
    @Param('slug') slug: string,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.newsService.recordView(slug, cookieHeader);
    if (result.counted) {
      response.cookie(result.cookieName, '1', {
        maxAge: 30 * 60 * 1000,
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
    }
    return { counted: result.counted, viewCount: result.viewCount };
  }
}
