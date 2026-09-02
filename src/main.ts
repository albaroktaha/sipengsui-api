import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, raw, urlencoded } from 'express';
import type { Request } from 'express';

type RawBodyRequest = Request & { rawBody?: Buffer };

function resolveTrustProxy(value: string | undefined): boolean | number {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'false' || normalized === '0') {
    return false;
  }
  if (normalized === 'true') return true;

  const hops = Number.parseInt(normalized, 10);
  return Number.isInteger(hops) && hops > 0 ? hops : false;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const webhookBodyLimit = Number.parseInt(
    process.env.WHATSAPP_WEBHOOK_MAX_BODY_BYTES ?? '262144',
    10,
  );
  const jsonLimit =
    Number.isInteger(webhookBodyLimit) && webhookBodyLimit > 0
      ? webhookBodyLimit
      : 262_144;
  app.use(
    '/whatsapp/webhook',
    raw({
      type: 'application/json',
      limit: jsonLimit,
      verify: (request, _response, rawBody) => {
        (request as RawBodyRequest).rawBody = Buffer.from(rawBody);
      },
    }),
  );
  // Parser umum memakai default Nest/body-parser. Limit webhook tidak boleh
  // membatasi JSON endpoint lain atau payload streaming yang sudah ada.
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // Express harus mengetahui jumlah reverse proxy agar throttler tidak
  // menganggap seluruh pengguna production berasal dari satu alamat proxy.
  app.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY));

  app.enableCors({
    origin: [
      process.env.CORS_ORIGIN ?? 'http://localhost:3001',
      'http://localhost:3000',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Serve uploaded files
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  const config = new DocumentBuilder()
    .setTitle('SIPENGSUI API')
    .setDescription('SIPENGSUI API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch(console.error);
