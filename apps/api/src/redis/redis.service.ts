import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';


@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client!: Redis;

  onModuleInit() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on('error', (err) => {
      // Never let a Redis blip crash the process — quota tracking and
      // caching degrade to "assume worst case" (see YoutubeQuotaService),
      // they don't take the API down. 
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  /** Plain options object for BullMQ's `connection` field (same Redis instance's config, separate connection). */
  static connectionOptions() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
    };
  }
}
