import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GisService } from './gis.service';
import { GisMapService } from './gis-map.service';

@ApiTags('Public GIS')
@Controller('public/gis')
export class PublicGisController {
  constructor(
    private readonly gisService: GisService,
    private readonly gisMapService: GisMapService,
  ) {}

  @Get('maps')
  @ApiOperation({
    summary: 'Daftar peta GIS (upload .kmz) yang sudah dipublikasikan (publik)',
  })
  getMaps() {
    return this.gisMapService.findPublished();
  }

  @Get('maps/:id/geometry')
  @ApiOperation({
    summary: 'Detail geometri peta GIS yang sudah dipublikasikan (publik)',
  })
  getMapGeometry(@Param('id') id: string) {
    return this.gisMapService.findPublishedGeometry(id);
  }

  @Get('map')
  @ApiOperation({
    summary: 'Gabungan semua layer GIS yang sudah dipublikasikan (publik)',
  })
  getMap() {
    return this.gisService.getMap({ publishedOnly: true });
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Ringkasan jumlah data GIS yang sudah dipublikasikan (publik)',
  })
  getSummary() {
    return this.gisService.getSummary({ publishedOnly: true });
  }
}
