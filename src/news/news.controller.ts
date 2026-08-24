import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CreateNewsDto, UpdateNewsDto } from './dto/create-news.dto';
import {
  CreateCategoryDto,
  CreateTagDto,
  MergeTagDto,
  ScheduleNewsDto,
  UpdateCategoryDto,
  UpdateTagDto,
} from './dto/category-tag.dto';
import { QueryNewsDto } from './dto/query-news.dto';
import { NewsService } from './news.service';
import { NewsStorageService } from './news-storage.service';

@ApiTags('News')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly storage: NewsStorageService,
  ) {}

  @Get('stats')
  @Permissions('news.read')
  @ApiOperation({ summary: 'Statistik berita untuk dashboard admin' })
  stats() {
    return this.newsService.getStats();
  }

  @Get('categories')
  @Permissions('news.read')
  categories() {
    return this.newsService.findCategories();
  }

  @Get('tags')
  @Permissions('news.read')
  tags() {
    return this.newsService.findTags();
  }

  @Get()
  @Permissions('news.read')
  findAll(@Query() query: QueryNewsDto) {
    return this.newsService.findAll(query);
  }

  @Get(':id/revisions')
  @Permissions('news.read')
  revisions(@Param('id') id: string) {
    return this.newsService.getRevisions(id);
  }

  @Get(':id')
  @Permissions('news.read')
  findOne(@Param('id') id: string) {
    return this.newsService.findOne(id);
  }

  @Post()
  @Permissions('news.create')
  create(
    @Body() dto: CreateNewsDto,
    @Req() request: Request & { user: { userId: string } },
  ) {
    return this.newsService.create(dto, request.user.userId);
  }

  @Post('media')
  @Permissions('news.manage')
  @ApiOperation({ summary: 'Upload gambar sampul atau inline berita' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    return this.storage.uploadImage(file);
  }

  @Patch(':id')
  @Permissions('news.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNewsDto,
    @Req() request: Request & { user: { userId: string } },
  ) {
    return this.newsService.update(id, dto, request.user.userId);
  }

  @Patch(':id/schedule')
  @Permissions('news.publish')
  schedule(@Param('id') id: string, @Body() dto: ScheduleNewsDto) {
    return this.newsService.schedule(id, dto);
  }

  @Patch(':id/publish')
  @Permissions('news.publish')
  publish(@Param('id') id: string) {
    return this.newsService.publish(id);
  }

  @Patch(':id/archive')
  @Permissions('news.archive')
  archive(@Param('id') id: string) {
    return this.newsService.archive(id);
  }

  @Patch(':id/restore')
  @Permissions('news.update')
  restore(@Param('id') id: string) {
    return this.newsService.restore(id);
  }

  @Post(':id/revisions/:revisionId/rollback')
  @Permissions('news.update')
  rollback(
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Req() request: Request & { user: { userId: string } },
  ) {
    return this.newsService.rollback(id, revisionId, request.user.userId);
  }

  @Post('categories')
  @Permissions('news.manage')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.newsService.createCategory(dto);
  }

  @Patch('categories/:id')
  @Permissions('news.manage')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.newsService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Permissions('news.manage')
  removeCategory(@Param('id') id: string) {
    return this.newsService.removeCategory(id);
  }

  @Post('tags')
  @Permissions('news.manage')
  createTag(@Body() dto: CreateTagDto) {
    return this.newsService.createTag(dto);
  }

  @Patch('tags/:id')
  @Permissions('news.manage')
  updateTag(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.newsService.updateTag(id, dto);
  }

  @Delete('tags/:id')
  @Permissions('news.manage')
  removeTag(@Param('id') id: string) {
    return this.newsService.removeTag(id);
  }

  @Post('tags/:id/merge')
  @Permissions('news.manage')
  mergeTag(@Param('id') id: string, @Body() dto: MergeTagDto) {
    return this.newsService.mergeTag(id, dto);
  }
}
