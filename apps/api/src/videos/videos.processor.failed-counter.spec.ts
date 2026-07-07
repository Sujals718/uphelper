import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { YoutubeClient } from '../youtube/youtube-client.service';
import { GeminiClient } from '../gemini/gemini-client.service';
import { VideosProcessor } from './videos.processor';

describe('VideosProcessor.onJobFailed', () => {
  let processor: VideosProcessor;
  let redis: { client: { incr: jest.Mock; expire: jest.Mock } };

  beforeEach(async () => {
    redis = { client: { incr: jest.fn(), expire: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VideosProcessor,
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: redis },
        { provide: YoutubeClient, useValue: {} },
        { provide: GeminiClient, useValue: {} },
      ],
    }).compile();

    processor = moduleRef.get(VideosProcessor);
  });

  it('increments the failed-jobs-today counter and sets a TTL on the first failure of the day', async () => {
    redis.client.incr.mockResolvedValue(1);

    await processor.onJobFailed(
      { data: { videoDbId: 'v1', youtubeVideoId: 'yt1' } } as any,
      new Error('Gemini call timed out'),
    );

    expect(redis.client.incr).toHaveBeenCalledWith(expect.stringMatching(/^video-scoring:failed-jobs:/));
    expect(redis.client.expire).toHaveBeenCalledWith(expect.stringMatching(/^video-scoring:failed-jobs:/), 26 * 60 * 60);
  });

  it('does not re-set the TTL on subsequent failures the same day', async () => {
    redis.client.incr.mockResolvedValue(2);

    await processor.onJobFailed(
      { data: { videoDbId: 'v1', youtubeVideoId: 'yt1' } } as any,
      new Error('Gemini call timed out'),
    );

    expect(redis.client.expire).not.toHaveBeenCalled();
  });

  it('never throws even if the job data is missing', async () => {
    redis.client.incr.mockResolvedValue(1);

    await expect(processor.onJobFailed(undefined, new Error('unknown'))).resolves.toBeUndefined();
  });

  it('swallows a Redis error rather than letting it escape the event handler', async () => {
    redis.client.incr.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      processor.onJobFailed({ data: { videoDbId: 'v1', youtubeVideoId: 'yt1' } } as any, new Error('boom')),
    ).resolves.toBeUndefined();
  });
});
