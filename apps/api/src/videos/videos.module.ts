import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { YoutubeModule } from '../youtube/youtube.module';
import { GeminiModule } from '../gemini/gemini.module';
import { RedisService } from '../redis/redis.service';
import { LanguageDetectionService } from './language-detection.service';
import { VideosController } from './videos.controller';
import { VideosService, VIDEO_SCORING_QUEUE } from './videos.service';
import { VideosProcessor } from './videos.processor';
import { TranscriptCanaryJob } from './canary/transcript-canary.job';

@Module({
  imports: [
    HttpModule,
    YoutubeModule,
    GeminiModule,
    // Queue connection options are resolved lazily via RedisService's
    // static helper rather than importing ConfigService here directly —
    // keeps this registration a one-liner, same REDIS_URL as everything
    // else in the app.
    BullModule.registerQueue({
      name: VIDEO_SCORING_QUEUE,
      connection: RedisService.connectionOptions(),
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService, VideosProcessor, LanguageDetectionService, TranscriptCanaryJob],
  exports: [VideosService, TranscriptCanaryJob],
})
export class VideosModule {}
