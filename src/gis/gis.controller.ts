import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GisService } from './gis.service';
import { QueryGisDto } from './dto/query-gis.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('GIS')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gis')
export class GisController {
  constructor(private readonly gisService: GisService) {}

  @Get('stations')
  @Permissions('gis.read')
  @ApiOperation({
    summary: 'Semua stasiun dalam format GeoJSON Point',
  })
  getStations(@Query() query: QueryGisDto) {
    return this.gisService.getStations(query);
  }

  @Get('stations/with-latest-obs')
  @Permissions('gis.read')
  @ApiOperation({
    summary: 'Stasiun dengan data observasi terakhir (GeoJSON)',
  })
  getStationsWithLatestObservation(@Query() query: QueryGisDto) {
    return this.gisService.getStationsWithLatestObservation(query);
  }

  @Get('rivers')
  @Permissions('gis.read')
  @ApiOperation({
    summary: 'Semua sungai dalam format GeoJSON LineString',
  })
  getRivers(@Query() query: QueryGisDto) {
    return this.gisService.getRivers(query);
  }

  @Get('watersheds')
  @Permissions('gis.read')
  @ApiOperation({
    summary: 'Semua DAS dalam format GeoJSON Polygon',
  })
  getWatersheds(@Query() query: QueryGisDto) {
    return this.gisService.getWatersheds(query);
  }

  @Get('river-regions')
  @Permissions('gis.read')
  @ApiOperation({
    summary: 'Semua Wilayah Sungai dalam format GeoJSON Polygon',
  })
  getRiverRegions(@Query() query: QueryGisDto) {
    return this.gisService.getRiverRegions(query);
  }

  @Get('map')
  @Permissions('gis.read')
  @ApiOperation({
    summary: 'Gabungan semua layer GIS (stations, rivers, watersheds, WS)',
  })
  getMap() {
    return this.gisService.getMap();
  }

  @Get('summary')
  @Permissions('gis.read')
  @ApiOperation({
    summary: 'Ringkasan jumlah data setiap layer GIS',
  })
  getSummary() {
    return this.gisService.getSummary();
  }
}
