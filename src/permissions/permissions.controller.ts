import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions as PermissionsDecorator } from '../auth/decorators/permissions.decorator';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @PermissionsDecorator('permissions.read')
  @ApiOperation({ summary: 'Daftar semua permission' })
  @ApiQuery({ name: 'group', required: false })
  findAll(@Query('group') group?: string) {
    return this.permissionsService.findAll(group);
  }

  @Get('groups')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @PermissionsDecorator('permissions.read')
  @ApiOperation({ summary: 'Daftar group permission' })
  findGroups() {
    return this.permissionsService.findGroups();
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @PermissionsDecorator('permissions.read')
  @ApiOperation({ summary: 'Detail permission' })
  findOne(@Param('id') id: string) {
    return this.permissionsService.findById(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN')
  @PermissionsDecorator('permissions.manage')
  @ApiOperation({ summary: 'Buat permission baru' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }
}
