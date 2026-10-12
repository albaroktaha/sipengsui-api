import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { isPrivateGisMapAssetRequest } from './gis/gis-static-assets.policy';
import { configureApiBodyParsers } from './http-body-parsers';

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

  configureApiBodyParsers(app.getHttpAdapter().getInstance());

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
    exposedHeaders: ['Content-Disposition'],
  });

  // Serve uploaded files
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (isPrivateGisMapAssetRequest(request.path)) {
      return response.sendStatus(404);
    }
    next();
  });
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
