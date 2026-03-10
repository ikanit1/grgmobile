import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
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
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret') {
      // eslint-disable-next-line no-console
      console.warn('⚠  ВНИМАНИЕ: JWT_SECRET не задан или используется значение по умолчанию! Задайте безопасный секрет в .env');
    }
    if (!process.env.CREDENTIALS_KEY || process.env.CREDENTIALS_KEY === 'dev-default-key-change-in-production') {
      // eslint-disable-next-line no-console
      console.warn('⚠  ВНИМАНИЕ: CREDENTIALS_KEY не задан или используется значение по умолчанию!');
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
  app.enableCors();

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
