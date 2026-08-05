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
import { RiversService } from './rivers.service';
import { CreateRiverDto } from './dto/create-river.dto';
import { UpdateRiverDto } from './dto/update-river.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rivers')
export class RiversController {
  constructor(private readonly riversService: RiversService) {}

  @Post()
  @Permissions('master-data.create')
  create(@Body() createRiverDto: CreateRiverDto) {
    return this.riversService.create(createRiverDto);
  }

  @Get()
  findAll(@Query('watershedId') watershedId?: string) {
    return this.riversService.findAll(watershedId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.riversService.findOne(id);
  }

  @Patch(':id')
  @Permissions('master-data.update')
  update(@Param('id') id: string, @Body() updateRiverDto: UpdateRiverDto) {
    return this.riversService.update(id, updateRiverDto);
  }

  @Delete(':id')
  @Permissions('master-data.delete')
  remove(@Param('id') id: string) {
    return this.riversService.remove(id);
  }

  @Patch(':id/publish')
  @Permissions('gis.publish')
  publish(@Param('id') id: string) {
    return this.riversService.publish(id);
  }

  @Patch(':id/unpublish')
  @Permissions('gis.publish')
  unpublish(@Param('id') id: string) {
    return this.riversService.unpublish(id);
  }
}
