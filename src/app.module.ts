import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { RiverRegionsModule } from './river-regions/river-regions.module';
import { WatershedsModule } from './watersheds/watersheds.module';
import { RiversModule } from './rivers/rivers.module';
import { StationsModule } from './stations/stations.module';
import { ObservationsModule } from './observations/observations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ImportsModule } from './imports/imports.module';
import { ImportHistoriesModule } from './import-histories/import-histories.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GisModule } from './gis/gis.module';
import { RekomtekModule } from './rekomtek/rekomtek.module';
import { FlowchartsModule } from './flowcharts/flowcharts.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { DisasterReportsModule } from './disaster-reports/disaster-reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    RiversModule,
    RiverRegionsModule,
    WatershedsModule,
    StationsModule,
    ObservationsModule,
    DashboardModule,
    ImportsModule,
    ImportHistoriesModule,
    AnalyticsModule,
    GisModule,
    RekomtekModule,
    FlowchartsModule,
    PermissionsModule,
    RolesModule,
    DisasterReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
