import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GisService } from './gis.service';

@ApiTags('Public GIS')
@Controller('public/gis')
export class PublicGisController {
  constructor(private readonly gisService: GisService) {}

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
