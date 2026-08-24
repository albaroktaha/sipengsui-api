import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';

import { JwtAuthGuard } from './guards/jwt-auth.guard';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { Request, Response } from 'express';

interface AuthRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@ApiTags('Autentikasi')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauthService: OAuthService,
  ) {}

  @Get('google')
  google(
    @Query('termsAccepted') termsAccepted: string | undefined,
    @Res() res: Response,
  ) {
    const result = this.oauthService.getAuthorizationUrl(
      'google',
      termsAccepted === 'true',
    );
    this.setOAuthStateCookie(res, result.state);
    return res.redirect(result.url);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.oauthRedirect('google', code, state, req, res);
  }

  @Get('github')
  github(
    @Query('termsAccepted') termsAccepted: string | undefined,
    @Res() res: Response,
  ) {
    const result = this.oauthService.getAuthorizationUrl(
      'github',
      termsAccepted === 'true',
    );
    this.setOAuthStateCookie(res, result.state);
    return res.redirect(result.url);
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.oauthRedirect('github', code, state, req, res);
  }

  private async oauthRedirect(
    provider: 'google' | 'github',
    code: string,
    state: string,
    req: Request,
    res: Response,
  ) {
    const frontendUrl = process.env.APP_URL ?? 'http://localhost:3001';
    try {
      const cookieState = req.headers.cookie
        ?.split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith('sipengsui-oauth-state='))
        ?.slice('sipengsui-oauth-state='.length);
      if (!cookieState || cookieState !== state) {
        return res.redirect(
          `${frontendUrl}/login?oauthError=${encodeURIComponent('Sesi OAuth tidak valid. Silakan coba lagi.')}`,
        );
      }

      const result = await this.oauthService.callback(provider, code, state);
      res.clearCookie('sipengsui-oauth-state', {
        sameSite: 'lax',
        path: '/auth',
      });

      if ('verificationRequired' in result && result.verificationRequired) {
        return res.redirect(
          `${frontendUrl}/verify-email?email=${encodeURIComponent(result.email)}&provider=${provider}`,
        );
      }

      if (!('accessToken' in result) || !result.accessToken) {
        return res.redirect(
          `${frontendUrl}/login?oauthError=${encodeURIComponent('Token OAuth tidak tersedia. Silakan coba lagi.')}`,
        );
      }

      const accessToken = result.accessToken;
      const fragment = new URLSearchParams({
        accessToken,
        user: JSON.stringify(result.user),
      });
      return res.redirect(`${frontendUrl}/auth/callback#${fragment}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OAuth gagal';
      return res.redirect(
        `${frontendUrl}/login?oauthError=${encodeURIComponent(message)}`,
      );
    }
  }

  private setOAuthStateCookie(res: Response, state: string) {
    res.cookie('sipengsui-oauth-state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/auth',
    });
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: AuthRequest) {
    return req.user;
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Lihat profil pengguna yang sedang login' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getProfile(@Req() req: AuthRequest) {
    return this.authService.getProfile(req.user.userId);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Ubah profil pengguna yang sedang login' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  updateProfile(@Req() req: AuthRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.userId, dto);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Ubah password pengguna yang sedang login' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(@Req() req: AuthRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.userId, dto);
  }

  @Post('me/profile/pending-email/resend')
  @ApiOperation({ summary: 'Kirim ulang verifikasi email profil' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resendPendingEmail(@Req() req: AuthRequest) {
    return this.authService.resendPendingEmail(req.user.userId);
  }

  @Delete('me/profile/pending-email')
  @ApiOperation({ summary: 'Batalkan perubahan email profil' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  cancelPendingEmail(@Req() req: AuthRequest) {
    return this.authService.cancelPendingEmail(req.user.userId);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }
}
