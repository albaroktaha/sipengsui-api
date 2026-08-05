import { Module } from '@nestjs/common';
import { WatershedsService } from './watersheds.service';
import { WatershedsController } from './watersheds.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WatershedsController],
  providers: [WatershedsService],
})
export class WatershedsModule {}
