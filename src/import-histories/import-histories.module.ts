import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ImportHistoriesController } from './import-histories.controller';
import { ImportHistoriesService } from './import-histories.service';

@Module({
  imports: [PrismaModule],
  controllers: [ImportHistoriesController],
  providers: [ImportHistoriesService],
})
export class ImportHistoriesModule {}
