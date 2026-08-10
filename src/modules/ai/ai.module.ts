import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiConfig } from './ai.config';
import { GeminiProvider } from './gemini/gemini.provider';
import { InputPolicyService } from './guardrails/input-policy.service';
import { OutputPolicyService } from './guardrails/output-policy.service';
import { InjectionDetectorService } from './guardrails/injection-detector.service';
import { TopicPolicyService } from './guardrails/topic-policy.service';
import { StaticKnowledgeService } from './knowledge/static-knowledge.service';
import { PrismaKnowledgeService } from './knowledge/prisma-knowledge.service';
import { AiAuditService } from './logging/ai-audit.service';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 10,
      },
    ]),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiConfig,
    GeminiProvider,
    InputPolicyService,
    OutputPolicyService,
    InjectionDetectorService,
    TopicPolicyService,
    StaticKnowledgeService,
    PrismaKnowledgeService,
    AiAuditService,
  ],
})
export class AiModule {}
