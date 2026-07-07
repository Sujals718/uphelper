import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { YoutubeQuotaService } from './youtube-quota.service';
import {
  YT_QUOTA_COST,
  YtCommentThreadListResponse,
  YtSearchListResponse,
  YtVideoListResponse,
} from './youtube-api.types';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

@Injectable()
export class YoutubeClient {
  private readonly logger = new Logger(YoutubeClient.name);
  private readonly apiKey = process.env.YOUTUBE_API_KEY ?? '';

  constructor(
    private readonly http: HttpService,
    private readonly quota: YoutubeQuotaService,
  ) {}

  private async get<T>(path: string, params: Record<string, string>, quotaCost: number): Promise<T> {
    if (await this.quota.isExhausted()) {
      this.logger.warn(`YouTube quota exhausted — refusing call to ${path}`);
      throw new ServiceUnavailableException('YouTube quota exhausted for today');
    }

    const query = new URLSearchParams({ ...params, key: this.apiKey }).toString();
    try {
      const { data } = await firstValueFrom(
        this.http.get<T>(`${BASE_URL}/${path}?${query}`, { timeout: 10_000 }),
      );
      // Record usage only after a successful call — a failed call (e.g.
      // network timeout before YouTube even processed it) shouldn't burn
      // quota we may not have actually spent. A quota-exceeded error
      // response IS a "spent" call from Google's perspective, but at that
      // point we're already blocked for the day regardless of our own
      // counter's exact accuracy.
      await this.quota.recordUsage(quotaCost);
      return data;
    } catch (err: any) {
      const status = err?.response?.status;
      const reason = err?.response?.data?.error?.errors?.[0]?.reason;
      if (status === 403 && reason === 'quotaExceeded') {
        this.logger.error('YouTube API reports quota exceeded');
        throw new ServiceUnavailableException('YouTube quota exhausted for today');
      }
      this.logger.error(`YouTube API "${path}" failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('YouTube is temporarily unavailable');
    }
  }

  /**
   * The single primary search call (100 quota units). `query` is either
   * the primary "{contest} {code} {name}" string or the fallback
   * "{contest} solutions" string — the caller (VideosService) decides
   * which, this method just executes whichever it's given.
   */
  async search(query: string, maxResults = 20): Promise<YtSearchListResponse> {
    return this.get<YtSearchListResponse>(
      'search',
      { part: 'snippet', q: query, type: 'video', maxResults: String(maxResults) },
      YT_QUOTA_COST.SEARCH_LIST,
    );
  }

  /**
   * Batched metadata fetch — all candidate IDs in ONE call (~1 quota unit
   * total, not per-video), per the build spec's explicit cost note.
   */
  async getVideoDetails(videoIds: string[]): Promise<YtVideoListResponse> {
    if (videoIds.length === 0) return { items: [] };
    return this.get<YtVideoListResponse>(
      'videos',
      { part: 'snippet,statistics,contentDetails', id: videoIds.join(',') },
      YT_QUOTA_COST.VIDEOS_LIST,
    );
  }

  /**
   * Top ~50 comments by relevance for one video — the bounded sample fed
   * to Gemini for sentiment. Comments disabled / API error both degrade
   * to an empty array rather than throwing, since "no comment data" is a
   * legitimate, common state (many videos disable comments) that
   * shouldn't block scoring on views/metadata alone.
   */
  async getTopComments(videoId: string, maxResults = 50): Promise<string[]> {
    try {
      const data = await this.get<YtCommentThreadListResponse>(
        'commentThreads',
        {
          part: 'snippet',
          videoId,
          order: 'relevance',
          maxResults: String(maxResults),
          textFormat: 'plainText',
        },
        YT_QUOTA_COST.COMMENT_THREADS_LIST,
      );
      return data.items.map((i) => i.snippet.topLevelComment.snippet.textDisplay);
    } catch (err) {
      this.logger.warn(`Comments unavailable for video ${videoId} (likely disabled): ${(err as Error).message}`);
      return [];
    }
  }
}
