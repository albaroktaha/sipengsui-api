import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { TurnstileModule } from './turnstile/turnstile.module';
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
import { AiModule } from './modules/ai/ai.module';
import { NewsModule } from './news/news.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    PrismaModule,
    AuthModule,
    TurnstileModule,
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
    AiModule,
    NewsModule,
    WhatsAppModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
