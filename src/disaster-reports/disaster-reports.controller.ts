import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DisasterReportsService } from './disaster-reports.service';
import {
  CreateDisasterReportDto,
  UpdateDisasterReportDto,
  QueryDisasterReportDto,
} from './dto/create-disaster-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string; roles: string[] };
}

@ApiTags('Disaster Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disaster-reports')
export class DisasterReportsController {
  constructor(
    private readonly disasterReportsService: DisasterReportsService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('disaster-reports.create')
  @ApiOperation({ summary: 'Buat laporan bencana baru' })
  create(@Body() dto: CreateDisasterReportDto, @Req() req: AuthRequest) {
    return this.disasterReportsService.create({
      ...dto,
      userId: req.user.userId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Daftar laporan bencana (filterable)' })
  findAll(@Query() query: QueryDisasterReportDto, @Req() req: AuthRequest) {
    // Regular users can only see their own reports
    // Admin/superadmin can see all
    const isAdmin = req.user.roles?.some(
      (r) => r === 'SUPER_ADMIN' || r === 'ADMIN',
    );
    return this.disasterReportsService.findAll({
      ...query,
      userId: isAdmin ? undefined : req.user.userId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail laporan bencana' })
  findOne(@Param('id') id: string) {
    return this.disasterReportsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update laporan bencana' })
  update(@Param('id') id: string, @Body() dto: UpdateDisasterReportDto) {
    return this.disasterReportsService.update(id, dto);
  }

  @Patch(':id/submit')
  @UseGuards(PermissionsGuard)
  @Permissions('disaster-reports.create')
  @ApiOperation({ summary: 'Kirim laporan bencana (DRAFT → SUBMITTED)' })
  submit(@Param('id') id: string) {
    return this.disasterReportsService.submit(id);
  }

  @Patch(':id/verify')
  @UseGuards(PermissionsGuard)
  @Permissions('disaster-reports.verify')
  @ApiOperation({ summary: 'Verifikasi laporan (SUBMITTED → VERIFIED)' })
  verify(@Param('id') id: string) {
    return this.disasterReportsService.verify(id);
  }

  @Patch(':id/reject')
  @UseGuards(PermissionsGuard)
  @Permissions('disaster-reports.verify')
  @ApiOperation({ summary: 'Tolak laporan (SUBMITTED → REJECTED)' })
  reject(@Param('id') id: string) {
    return this.disasterReportsService.reject(id);
  }
}
