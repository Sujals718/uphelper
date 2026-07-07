import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PlatformsModule } from './platforms/platforms.module';
import { MistakesModule } from './mistakes/mistakes.module';
import { RevisionModule } from './revision/revision.module';
import { RedisModule } from './redis/redis.module';
import { VideosModule } from './videos/videos.module';
import { PromptsModule } from './prompts/prompts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Needed for @Cron() to work anywhere in the app — the transcript-
    // fetch canary job (Phase 3) is the first thing to use it.
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    UsersModule,
    AuthModule,
    PlatformsModule,
    MistakesModule,
    RevisionModule,
    VideosModule,
    PromptsModule,
    AnalyticsModule,
    AdminModule,
  ],
})
export class AppModule {}