import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GisController } from './gis.controller';
import { GisService } from './gis.service';
import { GisMapController } from './gis-map.controller';
import { GisMapService } from './gis-map.service';
import { GisMapFileService } from './gis-map-file.service';
import { PublicGisController } from './public-gis.controller';

@Module({
  imports: [PrismaModule],
  controllers: [GisController, GisMapController, PublicGisController],
  providers: [GisService, GisMapService, GisMapFileService],
})
export class GisModule {}
