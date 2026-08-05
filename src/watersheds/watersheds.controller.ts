import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WatershedsService } from './watersheds.service';
import { CreateWatershedDto } from './dto/create-watershed.dto';
import { UpdateWatershedDto } from './dto/update-watershed.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('watersheds')
export class WatershedsController {
  constructor(private readonly watershedsService: WatershedsService) {}

  @Post()
  @Permissions('master-data.create')
  create(@Body() createWatershedDto: CreateWatershedDto) {
    return this.watershedsService.create(createWatershedDto);
  }

  @Get()
  findAll(@Query('riverRegionId') riverRegionId?: string) {
    return this.watershedsService.findAll(riverRegionId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.watershedsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('master-data.update')
  update(
    @Param('id') id: string,
    @Body() updateWatershedDto: UpdateWatershedDto,
  ) {
    return this.watershedsService.update(id, updateWatershedDto);
  }

  @Delete(':id')
  @Permissions('master-data.delete')
  remove(@Param('id') id: string) {
    return this.watershedsService.remove(id);
  }

  @Patch(':id/publish')
  @Permissions('gis.publish')
  publish(@Param('id') id: string) {
    return this.watershedsService.publish(id);
  }

  @Patch(':id/unpublish')
  @Permissions('gis.publish')
  unpublish(@Param('id') id: string) {
    return this.watershedsService.unpublish(id);
  }
}
