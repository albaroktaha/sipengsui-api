import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ImportHistoriesService } from './import-histories.service';
import { QueryImportHistoryDto } from './dto/query-import-history.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Import Histories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('import-histories')
export class ImportHistoriesController {
  constructor(
    private readonly importHistoriesService: ImportHistoriesService,
  ) {}

  @Get()
  @Permissions('imports.read')
  @ApiOperation({
    summary: 'List Import History',
  })
  findAll(
    @Query()
    query: QueryImportHistoryDto,
  ) {
    return this.importHistoriesService.findAll(query);
  }

  @Get('statistics')
  @Permissions('imports.read')
  @ApiOperation({
    summary: 'Statistik Import',
  })
  statistics() {
    return this.importHistoriesService.statistics();
  }

  @Get(':id/errors')
  @Permissions('imports.read')
  @ApiOperation({
    summary: 'Daftar Error Import',
  })
  findErrors(
    @Param('id')
    id: string,
  ) {
    return this.importHistoriesService.findErrors(id);
  }

  @Get(':id')
  @Permissions('imports.read')
  @ApiOperation({
    summary: 'Detail Import History',
  })
  findOne(
    @Param('id')
    id: string,
  ) {
    return this.importHistoriesService.findOne(id);
  }

  @Delete(':id')
  @Permissions('imports.delete')
  @ApiOperation({
    summary: 'Hapus Import History',
  })
  remove(
    @Param('id')
    id: string,
  ) {
    return this.importHistoriesService.remove(id);
  }
}
