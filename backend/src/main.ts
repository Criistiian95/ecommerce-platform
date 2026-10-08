import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.enableShutdownHooks();

  app.use(json({ limit: '4mb' }));
  app.use(urlencoded({ extended: true, limit: '4mb' }));

  const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Permit merchant storefronts on authenticated, single-label Diseñolys subdomains.
  // Never use the unrestricted wildcard origin with credentials.
  const tenantDomain = (process.env.STOREFRONT_DOMAIN || 'disenolys.store').toLowerCase();
  const tenantOrigin = new RegExp('^https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.' + tenantDomain.replace(/\./g, '\\.') + '

  await app.listen(Number(process.env.PORT ?? 3003));
}

void bootstrap();
);
  app.enableCors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || tenantOrigin.test(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  await app.listen(Number(process.env.PORT ?? 3003));
}

void bootstrap();
