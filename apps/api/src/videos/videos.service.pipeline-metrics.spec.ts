import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { YoutubeClient } from '../youtube/youtube-client.service';
import { LanguageDetectionService } from './language-detection.service';
import { GeminiClient } from '../gemini/gemini-client.service';
import { VideosService, VIDEO_SCORING_QUEUE } from './videos.service';

describe('VideosService.getPipelineMetrics', () => {
  let service: VideosService;
  let redis: { client: { get: jest.Mock } };
  let queue: { getJobCounts: jest.Mock };

  beforeEach(async () => {
    redis = { client: { get: jest.fn() } };
    queue = { getJobCounts: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: PrismaService, useValue: {} },
        { provide: YoutubeClient, useValue: {} },
        { provide: LanguageDetectionService, useValue: {} },
        { provide: RedisService, useValue: redis },
        { provide: GeminiClient, useValue: {} },
        { provide: getQueueToken(VIDEO_SCORING_QUEUE), useValue: queue },
      ],
    }).compile();

    service = moduleRef.get(VideosService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('computes a rounded hit-rate percentage from today\'s hit/miss counters', async () => {
    redis.client.get.mockImplementation((key: string) => {
      if (key.startsWith('video-search-cache:hits:')) return Promise.resolve('30');
      if (key.startsWith('video-search-cache:misses:')) return Promise.resolve('10');
      if (key.startsWith('video-scoring:failed-jobs:')) return Promise.resolve('2');
      return Promise.resolve(null);
    });
    queue.getJobCounts.mockResolvedValue({ waiting: 3, active: 1, delayed: 0 });

    const result = await service.getPipelineMetrics();

    expect(result.cache).toEqual({ hits: 30, misses: 10, hitRate: 75 });
    expect(result.queue).toEqual({ size: 4, pendingJobs: 3, activeJobs: 1, failedJobs: 2 });
  });

  it('returns a null hitRate (not 0) when nothing has been recorded yet today', async () => {
    redis.client.get.mockResolvedValue(null);
    queue.getJobCounts.mockResolvedValue({ waiting: 0, active: 0, delayed: 0 });

    const result = await service.getPipelineMetrics();

    expect(result.cache).toEqual({ hits: 0, misses: 0, hitRate: null });
    expect(result.queue.failedJobs).toBe(0);
  });
});
