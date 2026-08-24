import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { GisMasterDataImportService } from './gis-master-data-import.service';
import { GisMapService } from './gis-map.service';
import {
  CreateGisMapDto,
  UpdateGisMapDto,
  QueryGisMapsDto,
} from './dto/gis-map.dto';
import {
  GisMasterDataParentDto,
  ImportGisMasterDataDto,
} from './dto/gis-master-data-import.dto';

@ApiTags('GIS Maps')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gis/maps')
export class GisMapController {
  constructor(
    private readonly gisMapService: GisMapService,
    private readonly gisMasterDataImportService: GisMasterDataImportService,
  ) {}

  @Get()
  @Permissions('gis.read')
  findAll(@Query() query: QueryGisMapsDto) {
    return this.gisMapService.findAll(query);
  }

  @Get(':id')
  @Permissions('gis.read')
  findOne(@Param('id') id: string) {
    return this.gisMapService.findOne(id);
  }

  @Get(':id/geometry')
  @Permissions('gis.read')
  findOneWithGeometry(@Param('id') id: string) {
    return this.gisMapService.findOneWithGeometry(id);
  }

  @Post()
  @Permissions('gis.manage')
  create(@Body() dto: CreateGisMapDto) {
    return this.gisMapService.create(dto);
  }

  @Post(':id/file')
  @Permissions('gis.manage')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 30 * 1024 * 1024 },
    }),
  )
  uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.gisMapService.uploadFile(id, file);
  }

  @Post(':id/master-data/preview')
  @Permissions('gis.manage')
  previewMasterData(
    @Param('id') id: string,
    @Body() dto: GisMasterDataParentDto,
  ) {
    return this.gisMasterDataImportService.preview(id, dto);
  }

  @Post(':id/master-data/import')
  @Permissions('gis.manage')
  importMasterData(
    @Param('id') id: string,
    @Body() dto: ImportGisMasterDataDto,
  ) {
    return this.gisMasterDataImportService.import(id, dto);
  }

  @Patch(':id')
  @Permissions('gis.manage')
  update(@Param('id') id: string, @Body() dto: UpdateGisMapDto) {
    return this.gisMapService.update(id, dto);
  }

  @Patch(':id/publish')
  @Permissions('gis.publish')
  publish(@Param('id') id: string) {
    return this.gisMapService.publish(id);
  }

  @Patch(':id/unpublish')
  @Permissions('gis.publish')
  unpublish(@Param('id') id: string) {
    return this.gisMapService.unpublish(id);
  }

  @Delete(':id')
  @Permissions('gis.manage')
  remove(@Param('id') id: string) {
    return this.gisMapService.remove(id);
  }
}
