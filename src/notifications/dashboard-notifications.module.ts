import { Module } from '@nestjs/common';
import { DashboardNotificationsController } from './dashboard-notifications.controller';
import { DashboardNotificationsService } from './dashboard-notifications.service';
import { DashboardNotificationManagementGuard } from './dashboard-notification-management.guard';

@Module({
  controllers: [DashboardNotificationsController],
  providers: [
    DashboardNotificationsService,
    DashboardNotificationManagementGuard,
  ],
})
export class DashboardNotificationsModule {}
