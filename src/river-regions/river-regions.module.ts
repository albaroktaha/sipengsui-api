import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { RiverRegionsService } from './river-regions.service';
import { RiverRegionsController } from './river-regions.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RiverRegionsController],
  providers: [RiverRegionsService],
})
export class RiverRegionsModule {}
