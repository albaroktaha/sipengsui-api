import { Module } from '@nestjs/common';
import { DisasterReportsController } from './disaster-reports.controller';
import { PublicDisasterReportController } from './public-disaster-reports.controller';
import { DisasterReportsService } from './disaster-reports.service';
import { DisasterReportFileService } from './disaster-report-file.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DisasterReportsController, PublicDisasterReportController],
  providers: [DisasterReportsService, DisasterReportFileService],
  exports: [DisasterReportsService],
})
export class DisasterReportsModule {}
