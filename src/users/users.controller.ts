import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { SyncPermissionsDto } from './dto/sync-permissions.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Permissions('users.read')
  @ApiOperation({ summary: 'Daftar semua user (paginated, searchable)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.usersService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Permissions('users.read')
  @ApiOperation({ summary: 'Detail user' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN')
  @Permissions('users.update')
  @ApiOperation({ summary: 'Update user (nama, email, status, dll)' })
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, body, actor.userId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN')
  @Permissions('users.delete')
  @ApiOperation({ summary: 'Non-aktifkan user' })
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.remove(id, actor.userId);
  }

  // ─── Role Assignment ──────────────────────────────────────

  @Post(':id/roles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Assign role ke user' })
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(id, dto.roleId);
  }

  @Delete(':id/roles/:roleId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Hapus role dari user' })
  removeRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.usersService.removeRole(id, roleId);
  }

  // ─── Permission Assignment ────────────────────────────────

  @Post(':id/permissions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Assign permission ke user' })
  assignPermission(@Param('id') id: string, @Body() dto: AssignPermissionDto) {
    return this.usersService.assignPermission(id, dto.permissionId);
  }

  @Delete(':id/permissions/:permissionId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Hapus permission dari user' })
  removePermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.usersService.removePermission(id, permissionId);
  }

  @Post(':id/permissions/sync')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Sinkronisasi semua permission user (replace all)' })
  syncPermissions(@Param('id') id: string, @Body() dto: SyncPermissionsDto) {
    return this.usersService.syncPermissions(id, dto.permissionIds);
  }
}
