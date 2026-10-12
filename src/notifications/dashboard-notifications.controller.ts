import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateDashboardNotificationDto,
  DashboardNotificationManagementQueryDto,
  UpdateDashboardNotificationDto,
} from './dashboard-notification.dto';
import { DashboardNotificationManagementGuard } from './dashboard-notification-management.guard';
import { DashboardNotificationsService } from './dashboard-notifications.service';

@ApiTags('Notifikasi Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class DashboardNotificationsController {
  constructor(private readonly notifications: DashboardNotificationsService) {}

  @Get('inbox')
  @ApiOperation({
    summary: 'Daftar notifikasi dashboard dan jumlah belum dibaca',
  })
  inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.getInbox(user, unreadOnly === 'true');
  }

  @Patch('inbox/read-all')
  @ApiOperation({ summary: 'Tandai semua notifikasi sebagai dibaca' })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user);
  }

  @Patch('inbox/:kind/:notificationId/read')
  @ApiOperation({ summary: 'Tandai satu notifikasi sebagai dibaca' })
  markRead(
    @Param('kind') kind: string,
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.markRead(kind, notificationId, user);
  }

  @Get('manage')
  @UseGuards(DashboardNotificationManagementGuard)
  @ApiOperation({ summary: 'Daftar pemberitahuan untuk dikelola' })
  managedNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardNotificationManagementQueryDto,
  ) {
    return this.notifications.getManagedNotifications(user, query);
  }

  @Post('manage')
  @UseGuards(DashboardNotificationManagementGuard)
  @ApiOperation({ summary: 'Buat atau terbitkan pemberitahuan dashboard' })
  createNotification(
    @Body() dto: CreateDashboardNotificationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.createNotification(dto, user);
  }

  @Patch('manage/:notificationId')
  @UseGuards(DashboardNotificationManagementGuard)
  @ApiOperation({ summary: 'Ubah draf atau arsipkan pemberitahuan dashboard' })
  updateNotification(
    @Param('notificationId') notificationId: string,
    @Body() dto: UpdateDashboardNotificationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.updateNotification(notificationId, dto, user);
  }
}
