import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Refresh tokens travel as an httpOnly cookie, never as a JSON field the
  // client can read — this is what makes them unreachable to XSS. We need
  // cookie-parser on the server side to read that cookie back out.
  app.use(cookieParser());

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true, // required for the cookie to be sent cross-origin
  });

  app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,        // strips any body fields not declared on the DTO
    forbidNonWhitelisted: true, // rejects the request if extra fields are sent, instead of silently dropping them
    transform: true,        // lets @Param()/@Query() values get coerced to declared types
  }),
);
  const port = process.env.API_PORT ?? 4000;
  await app.listen(port);

  // GET /videos/search now waits for the entire scoring pipeline to
  // finish before responding (see videos.service.ts's
  // SCORING_PIPELINE_TIMEOUT_MS, ~100s by default) instead of returning
  // partial results quickly. Node's default server socket timeout would
  // otherwise risk killing that connection mid-request, so it's raised
  // here with headroom above the pipeline's own cap.
  const httpServer = app.getHttpServer();
  httpServer.setTimeout(130_000);

  // eslint-disable-next-line no-console
  console.log(`Uphelper API listening on :${port}`);
}
bootstrap();
