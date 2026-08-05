import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

import { FlowchartsService } from './flowcharts.service';

import { CreateFlowchartDto } from './dto/create-flowchart.dto';
import { UpdateFlowchartDto } from './dto/update-flowchart.dto';

@ApiTags('Flowchart - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('flowcharts')
export class AdminFlowchartsController {
  constructor(private readonly flowchartsService: FlowchartsService) {}

  @Get()
  @Permissions('flowchart.manage')
  @ApiOperation({ summary: 'Daftar semua flowchart (admin)' })
  findAll() {
    return this.flowchartsService.findAll();
  }

  @Post()
  @Permissions('flowchart.manage')
  @ApiOperation({ summary: 'Buat flowchart baru (admin)' })
  create(@Body() dto: CreateFlowchartDto) {
    return this.flowchartsService.create(dto);
  }

  @Get(':id')
  @Permissions('flowchart.manage')
  @ApiOperation({ summary: 'Detail flowchart (admin)' })
  findOne(@Param('id') id: string) {
    return this.flowchartsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('flowchart.manage')
  @ApiOperation({ summary: 'Update flowchart (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateFlowchartDto) {
    return this.flowchartsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('flowchart.manage')
  @ApiOperation({ summary: 'Hapus flowchart (admin)' })
  remove(@Param('id') id: string) {
    return this.flowchartsService.remove(id);
  }
}
