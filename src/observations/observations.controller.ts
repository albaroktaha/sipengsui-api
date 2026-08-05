import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ObservationsService } from './observations.service';

import { CreateObservationDto } from './dto/create-observation.dto';
import { UpdateObservationDto } from './dto/update-observation.dto';
import { QueryObservationDto } from './dto/query-observation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Observations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('observations')
export class ObservationsController {
  constructor(private readonly observationsService: ObservationsService) {}

  @Post()
  @Permissions('observations.create')
  @ApiOperation({
    summary: 'Tambah observation manual',
  })
  create(
    @Body()
    dto: CreateObservationDto,
  ) {
    return this.observationsService.create(dto);
  }

  @Get()
  @Permissions('observations.read')
  @ApiOperation({
    summary: 'List observation',
  })
  findAll(
    @Query()
    query: QueryObservationDto,
  ) {
    return this.observationsService.paginate(query);
  }

  @Get('latest')
  @Permissions('observations.read')
  @ApiOperation({
    summary: '20 observation terbaru',
  })
  latest() {
    return this.observationsService.latest();
  }

  @Get('station/:stationId')
  @Permissions('observations.read')
  @ApiOperation({
    summary: 'Observation berdasarkan station',
  })
  findByStation(
    @Param('stationId')
    stationId: string,
  ) {
    return this.observationsService.findByStation(stationId);
  }

  @Get(':id')
  @Permissions('observations.read')
  @ApiOperation({
    summary: 'Detail observation',
  })
  findOne(
    @Param('id')
    id: string,
  ) {
    return this.observationsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('observations.update')
  @ApiOperation({
    summary: 'Update observation',
  })
  update(
    @Param('id')
    id: string,

    @Body()
    dto: UpdateObservationDto,
  ) {
    return this.observationsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('observations.delete')
  @ApiOperation({
    summary: 'Hapus observation',
  })
  remove(
    @Param('id')
    id: string,
  ) {
    return this.observationsService.remove(id);
  }
}
