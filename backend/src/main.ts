import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as express from 'express';
import { config } from 'dotenv';

config();

if (process.env.DB_TYPE !== 'postgres') {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    // Проверяем обязательные секреты и конфигурацию
    const requiredSecrets = [
      { env: 'JWT_SECRET', forbidden: 'dev-secret', name: 'JWT Secret' },
      { env: 'CREDENTIALS_ENCRYPTION_KEY', forbidden: 'dev-default-key-change-in-production', name: 'Credentials Encryption Key' },
      { env: 'WEBHOOK_SECRET', forbidden: 'your-webhook-secret', name: 'Webhook Secret' },
      { env: 'DB_PASSWORD', forbidden: 'postgres', name: 'Database Password' },
      { env: 'CORS_ORIGINS', forbidden: undefined, name: 'CORS Origins' },
      { env: 'WS_ALLOWED_ORIGINS', forbidden: undefined, name: 'WebSocket Allowed Origins' },
    ];

    for (const { env, forbidden, name } of requiredSecrets) {
      const value = process.env[env];
      if (!value || value?.trim() === '' || (forbidden && value === forbidden)) {
        console.error(`❌ ОШИБКА: ${name} (${env}) должен быть задан и отличаться от значения по умолчанию в production`);
        process.exit(1);
      }
    }
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // CORS configuration - restrict origins in production, allow localhost in dev
  const isProd = process.env.NODE_ENV === 'production';
  const envCorsOrigins = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean);
  const corsOrigins = envCorsOrigins && envCorsOrigins.length > 0
    ? envCorsOrigins
    : (isProd ? [] : ['http://localhost:8100', 'http://localhost:3000']);
  console.log(`[CORS] Allowed origins:`, corsOrigins);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Ограничение размера тела запроса для защиты от DoS
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Doorphone API')
    .setDescription('API управления домофонами (мультитенант, Akuvox, Uniview LiteAPI)')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('auth', 'Авторизация')
    .addTag('organizations', 'Организации (УК)')
    .addTag('complexes', 'Жилые комплексы')
    .addTag('buildings', 'Здания')
    .addTag('apartments', 'Квартиры')
    .addTag('houses', 'Дома (совместимость)')
    .addTag('devices', 'Устройства и управление')
    .addTag('discovery', 'ONVIF Discovery')
    .addTag('webhooks', 'Вебхуки (события от панелей)')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Doorphone API',
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port as number, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${port} (0.0.0.0)`);
  // eslint-disable-next-line no-console
  console.log(`Swagger UI: http://localhost:${port}/docs`);
  // eslint-disable-next-line no-console
  console.log(`Админ-панель: http://localhost:${port}/api/admin`);
}

bootstrap();
