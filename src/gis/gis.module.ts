import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GisController } from './gis.controller';
import { GisService } from './gis.service';
import { PublicGisController } from './public-gis.controller';

@Module({
  imports: [PrismaModule],
  controllers: [GisController, PublicGisController],
  providers: [GisService],
})
export class GisModule {}
