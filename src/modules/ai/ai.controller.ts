import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { pipeUIMessageStreamToResponse } from 'ai';
import type { Request, Response } from 'express';
import { AiService } from './ai.service';
import { AiConfig } from './ai.config';

@ApiTags('AI Chatbot (Public)')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly config: AiConfig,
  ) {}

  @Post('chat')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Kirim pesan ke Asisten SIPENGSUI (streaming UI message stream)',
  })
  async chat(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const stream = await this.aiService.createChatStream({ body, request });
    await pipeUIMessageStreamToResponse({ response, stream });
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Daftar pertanyaan cepat yang disarankan' })
  getSuggestions(): { suggestions: string[] } {
    return { suggestions: this.config.suggestions };
  }

  @Get('health')
  @ApiOperation({ summary: 'Status kesehatan fitur chatbot' })
  getHealth(): { enabled: boolean; model: string } {
    return {
      enabled: this.config.enabled && Boolean(this.config.apiKey),
      model: this.config.modelId,
    };
  }
}
