import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RiverRegionsService } from './river-regions.service';
import { CreateRiverRegionDto } from './dto/create-river-region.dto';
import { UpdateRiverRegionDto } from './dto/update-river-region.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('river-regions')
export class RiverRegionsController {
  constructor(private readonly riverRegionsService: RiverRegionsService) {}

  @Post()
  @Permissions('master-data.create')
  create(@Body() createRiverRegionDto: CreateRiverRegionDto) {
    return this.riverRegionsService.create(createRiverRegionDto);
  }

  @Get()
  findAll() {
    return this.riverRegionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.riverRegionsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('master-data.update')
  update(
    @Param('id') id: string,
    @Body() updateRiverRegionDto: UpdateRiverRegionDto,
  ) {
    return this.riverRegionsService.update(id, updateRiverRegionDto);
  }

  @Delete(':id')
  @Permissions('master-data.delete')
  remove(@Param('id') id: string) {
    return this.riverRegionsService.remove(id);
  }

  @Patch(':id/publish')
  @Permissions('gis.publish')
  publish(@Param('id') id: string) {
    return this.riverRegionsService.publish(id);
  }

  @Patch(':id/unpublish')
  @Permissions('gis.publish')
  unpublish(@Param('id') id: string) {
    return this.riverRegionsService.unpublish(id);
  }
}
