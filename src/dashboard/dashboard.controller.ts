import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('statistics')
  @ApiOperation({ summary: 'Statistik umum dashboard' })
  statistics() {
    return this.dashboardService.statistics();
  }

  @Get('superadmin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN')
  @Permissions('dashboard.system')
  @ApiOperation({ summary: 'Dashboard Superadmin — statistik sistem' })
  superadminStats() {
    return this.dashboardService.superadminStats();
  }

  @Get('admin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('dashboard.admin')
  @ApiOperation({ summary: 'Dashboard Admin — statistik data' })
  adminStats() {
    return this.dashboardService.adminStats();
  }

  @Get('hydrology')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('PETUGAS', 'ADMIN')
  @Permissions('dashboard.hydrology')
  @ApiOperation({ summary: 'Dashboard Hidrologi — fokus data observasi' })
  hydrologyStats() {
    return this.dashboardService.hydrologyStats();
  }

  @Get('rekomtek')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('PETUGAS', 'ADMIN')
  @Permissions('dashboard.rekomtek')
  @ApiOperation({ summary: 'Dashboard Rekomtek — fokus workflow rekomtek' })
  rekomtekStats() {
    return this.dashboardService.rekomtekStats();
  }

  @Get('user/:userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Dashboard User — data pribadi' })
  userStats(@Param('userId') userId: string) {
    return this.dashboardService.userStats(userId);
  }
}
