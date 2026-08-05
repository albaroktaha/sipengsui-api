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

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

import { RekomtekService } from './rekomtek.service';

import { CreateRekomtekDto } from './dto/create-rekomtek.dto';
import { UpdateRekomtekDto } from './dto/update-rekomtek.dto';
import { QueryRekomtekDto } from './dto/query-rekomtek.dto';

@ApiTags('Rekomtek')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rekomtek')
export class RekomtekController {
  constructor(private readonly rekomtekService: RekomtekService) {}

  @Post()
  @Permissions('rekomtek.create')
  @ApiOperation({ summary: 'Buat rekomtek baru (status: DRAFT)' })
  create(@Body() dto: CreateRekomtekDto) {
    return this.rekomtekService.create(dto);
  }

  @Get()
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Daftar rekomtek (paginated, filterable)' })
  findAll(@Query() query: QueryRekomtekDto) {
    return this.rekomtekService.findAll(query);
  }

  @Get(':id')
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Detail rekomtek' })
  findOne(@Param('id') id: string) {
    return this.rekomtekService.findOne(id);
  }

  @Patch(':id')
  @Permissions('rekomtek.update')
  @ApiOperation({ summary: 'Update rekomtek' })
  update(@Param('id') id: string, @Body() dto: UpdateRekomtekDto) {
    return this.rekomtekService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('rekomtek.delete')
  @ApiOperation({ summary: 'Hapus rekomtek' })
  remove(@Param('id') id: string) {
    return this.rekomtekService.remove(id);
  }

  @Patch(':id/submit')
  @Permissions('rekomtek.create')
  @ApiOperation({ summary: 'Ajukan rekomtek untuk review (DRAFT → REVIEW)' })
  submit(@Param('id') id: string) {
    return this.rekomtekService.submit(id);
  }

  @Patch(':id/approve')
  @Permissions('rekomtek.approve')
  @ApiOperation({ summary: 'Setujui rekomtek (REVIEW → APPROVED)' })
  approve(@Param('id') id: string, @Body('reviewedBy') reviewedBy: string) {
    return this.rekomtekService.approve(id, reviewedBy);
  }

  @Patch(':id/reject')
  @Permissions('rekomtek.approve')
  @ApiOperation({ summary: 'Tolak rekomtek (REVIEW → REJECTED)' })
  reject(@Param('id') id: string, @Body('reviewedBy') reviewedBy: string) {
    return this.rekomtekService.reject(id, reviewedBy);
  }

  @Patch(':id/publish')
  @Permissions('rekomtek.publish')
  @ApiOperation({ summary: 'Publikasikan rekomtek (APPROVED → PUBLISHED)' })
  publish(@Param('id') id: string, @Body('approvedBy') approvedBy: string) {
    return this.rekomtekService.publish(id, approvedBy);
  }
}
