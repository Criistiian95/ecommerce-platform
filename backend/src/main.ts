import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.enableShutdownHooks();
  app.use('/auth/password', json({ limit: '8kb' }));
  app.use(json({ limit: '4mb' }));
  app.use(urlencoded({ extended: true, limit: '4mb' }));

  const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',').map(origin => origin.trim()).filter(Boolean);
  const suffix = '.' + (process.env.STOREFRONT_DOMAIN || 'disenolys.store').toLowerCase();
  app.enableCors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) { callback(null, true); return; }
      let permitted = false;
      try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();
        const sub = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : '';
        permitted = url.protocol === 'https:' && url.port === '' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub);
      } catch { /* Invalid origin. */ }
      callback(null, permitted);
    },
    credentials: true,
  });

  await app.listen(Number(process.env.PORT ?? 3003));
}

void bootstrap();
