import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';

export interface SentimentResult {
  /** 0-100. How satisfied/helped viewers seem, per the comment sample. */
  satisfactionScore: number;
  sampledCommentCount: number;
}


const QUOTA_EXHAUSTED_TTL_SECONDS = 26 * 60 * 60;

function quotaExhaustedKey(): string {
  const d = new Date();
  return `gemini-quota-exhausted:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly apiKey = process.env.GEMINI_API_KEY ?? '';
  // Centralize the model selection via env fallback
  private readonly model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

  constructor(
    private readonly http: HttpService,
    private readonly redis: RedisService,
  ) {}

  /**
   * True once a 429 has been seen today — callers (VideosProcessor,
   * VideosService) use this to skip even ATTEMPTING a Gemini call for the
   * rest of a scoring batch once quota is known to be exhausted, rather
   * than discovering that fresh on every single video and logging a 429
   * per video.
   */
  async isQuotaExhausted(): Promise<boolean> {
    return (await this.redis.client.get(quotaExhaustedKey())) !== null;
  }

  private async markQuotaExhausted(): Promise<void> {
    await this.redis.client.set(quotaExhaustedKey(), '1', 'EX', QUOTA_EXHAUSTED_TTL_SECONDS);
  }

  /**
   * Classifies up to ~50 comments in ONE batched prompt and returns a single satisfaction score.
   * If Gemini is unreachable, returns null for graceful degradation.
   */
  async scoreCommentSentiment(comments: string[]): Promise<SentimentResult | null> {
    if (comments.length === 0) {
      return null;
    }

    if (await this.isQuotaExhausted()) {
      // Already know today's quota is gone — don't even make the call.
      this.logger.debug('Skipping Gemini sentiment call — quota already marked exhausted for today');
      return null;
    }

    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const prompt = this.buildPrompt(comments);

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          `${baseUrl}?key=${this.apiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              // Force Gemini to strictly adhere to your TypeScript contract
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  satisfaction_score: {
                    type: 'INTEGER',
                    description: 'A score between 0 and 100 based on competitive programming comment sentiment.',
                  },
                },
                required: ['satisfaction_score'],
              },
            },
          },
          { timeout: 15_000 },
        ),
      );

      const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        this.logger.warn('Gemini returned an empty response body for sentiment scoring');
        return null;
      }

      const parsed = JSON.parse(text) as { satisfaction_score: number };
      
      return {
        // Enforce safety bounds
        satisfactionScore: Math.max(0, Math.min(100, parsed.satisfaction_score)),
        sampledCommentCount: comments.length,
      };
    } catch (err: any) {
      if (err.response?.status === 429) {
        // Quota exhaustion, not a transient error — mark it and move on.
        // Do NOT retry here: retrying into a 429 immediately only makes
        // it worse, and every future call this UTC day will now short-
        // circuit via isQuotaExhausted() above instead of re-discovering
        // the same 429 per video.
        await this.markQuotaExhausted();
        this.logger.warn('Gemini quota exhausted (429) — skipping Gemini sentiment scoring for the rest of today');
        return null;
      }

      // Diagnostic logging for debugging API issues
      this.logger.error(`Gemini sentiment scoring failed: ${err.message}`);
      if (err.response) {
        this.logger.debug(`Status: ${err.response.status}`);
        this.logger.debug(`Response Data: ${JSON.stringify(err.response.data)}`);
      }
      return null;
    }
  }

  private buildPrompt(comments: string[]): string {
    const numbered = comments.map((c, i) => `${i + 1}. ${c.replace(/\n/g, ' ').slice(0, 500)}`).join('\n');
    
    return `You are scoring YouTube comments on a competitive-programming tutorial video for overall viewer satisfaction — did this video actually help people understand the problem/solution?

Comments often use domain jargon (TLE, editorial, AC, WA, "got accepted"), sarcasm, and mixed Hindi-English text (Hinglish like "samajh aa gaya", "best explanation bhaiya"). Interpret these naturally; do not penalize jargon, technical terms, or code-mixing as negative sentiment.

Comments:
${numbered}

Analyze the overall batch sentiment and return the satisfaction_score field according to the provided schema.`;
  }
}