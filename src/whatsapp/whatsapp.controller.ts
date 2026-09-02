import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { SetWhatsAppConsentDto } from './whatsapp.dto';
import { WhatsAppIdentityService } from './whatsapp-identity.service';
import { WhatsAppDispatcherService } from './whatsapp-dispatcher.service';
import { WhatsAppOutboxService } from './whatsapp-outbox.service';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly webhook: WhatsAppWebhookService,
    private readonly identities: WhatsAppIdentityService,
    private readonly outbox: WhatsAppOutboxService,
    private readonly dispatcher: WhatsAppDispatcherService,
  ) {}

  @Post('webhook')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terima event webhook WAHA secara idempoten' })
  receiveWebhook(
    @Req() request: RawBodyRequest,
    @Headers('x-webhook-hmac') signature?: string,
    @Headers('x-webhook-hmac-algorithm') algorithm?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
    @Headers('x-webhook-request-id') requestId?: string,
    @Headers('x-webhook-secret') customSecret?: string,
    @Headers('content-type') contentType?: string,
  ) {
    return this.webhook.accept({
      rawBody: request.rawBody,
      signature,
      algorithm,
      timestamp,
      requestId,
      customSecret,
      contentType,
    });
  }

  @Post('pairing-code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buat kode sekali pakai untuk menautkan WhatsApp' })
  createPairingCode(@CurrentUser() user: AuthenticatedUser) {
    return this.identities.createPairingCode(user.userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lihat status WhatsApp dan consent akun sendiri' })
  getMyWhatsApp(@CurrentUser() user: AuthenticatedUser) {
    return this.identities.getStatusForUser(user.userId);
  }

  @Post('me/consents')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ubah consent WhatsApp akun sendiri' })
  setMyConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetWhatsAppConsentDto,
  ) {
    return this.identities.setConsentForUser(
      user.userId,
      dto.purpose,
      dto.active,
    );
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Putuskan tautan WhatsApp akun sendiri' })
  async unlinkMyWhatsApp(@CurrentUser() user: AuthenticatedUser) {
    await this.identities.unlinkUser(user.userId);
    return { success: true };
  }

  @Get('admin/summary')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('users.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ringkasan operasional WhatsApp dan outbox' })
  getAdminSummary() {
    return this.outbox.getAdminSummary();
  }

  @Get('admin/health')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('users.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lihat health session WAHA secara aman' })
  getAdminHealth() {
    return this.dispatcher.getHealth();
  }

  @Post('admin/outbox/:id/requeue')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('users.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Masukkan ulang outbox WhatsApp DEAD' })
  async requeueOutbox(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const requeued = await this.outbox.requeueDead(id, user.userId);
    return { requeued };
  }
}
