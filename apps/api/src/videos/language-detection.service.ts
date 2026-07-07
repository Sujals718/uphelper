import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import * as francModule from 'franc';
import type { LanguageSource } from '@uphelper/shared-types';
import { createConcurrencyLimiter } from '../common/concurrency-limit.util';

type FrancFn = (text: string, options?: { minLength?: number }) => string;


const resolvedFranc: FrancFn | undefined =
  typeof (francModule as unknown) === 'function'
    ? (francModule as unknown as FrancFn)
    : typeof (francModule as any)?.franc === 'function'
      ? (francModule as any).franc
      : typeof (francModule as any)?.default === 'function'
        ? (francModule as any).default
        : undefined;

const francResolutionLogger = new Logger('LanguageDetectionService:franc');
let loggedUnresolvedFranc = false;


function safeFranc(text: string, options?: { minLength?: number }): string {
  if (!resolvedFranc) {
    if (!loggedUnresolvedFranc) {
      francResolutionLogger.error(
        "The 'franc' package did not export a callable function in any recognized shape (checked: module-as-function, .franc, .default) — text-based language detection (metadata-text tier and transcript tier) will report every video as 'uncertain' until this is fixed. Check the installed franc version/build.",
      );
      loggedUnresolvedFranc = true;
    }
    return 'und';
  }
  try {
    return resolvedFranc(text, options);
  } catch (err) {
    francResolutionLogger.warn(`franc() threw on input, treating as undetermined: ${(err as Error).message}`);
    return 'und';
  }
}

export interface LanguageDetectionResult {
  language: string | null; // ISO 639-1 where possible, franc's 639-3 code as a fallback
  confidence: number | null; // 0-1
  source: LanguageSource;
  transcriptWasTried: boolean;
  rateLimited?: boolean;
}

// franc returns ISO 639-3. Map the handful of languages actually relevant
// to this content (English + the common Indian-subcontinent languages CP
// tutorial content appears in) to ISO 639-1 for a nicer UI label. Anything
// not in this map is shown as its 639-3 code rather than guessed at —
// an incomplete map is honest; a wrong guess is not.
const ISO_639_3_TO_1: Record<string, string> = {
  eng: 'en',
  hin: 'hi',
  ben: 'bn',
  tam: 'ta',
  tel: 'te',
  mar: 'mr',
  urd: 'ur',
  kan: 'kn',
  guj: 'gu',
  mal: 'ml',
};

// Title+description text is short and noisy compared to a full transcript,
// so it needs a minimum amount of text before trusting franc's guess at
// all, and gets a lower confidence score than a transcript-based reading
// even when it succeeds.
const METADATA_TEXT_MIN_LENGTH = 30;
const METADATA_TEXT_CONFIDENCE = 0.55;
const TRANSCRIPT_CONFIDENCE = 0.75;


const TRANSCRIPT_FETCH_CONCURRENCY = Number(process.env.TRANSCRIPT_FETCH_CONCURRENCY ?? 3);
const transcriptFetchLimit = createConcurrencyLimiter(TRANSCRIPT_FETCH_CONCURRENCY);


@Injectable()
export class LanguageDetectionService {
  private readonly logger = new Logger(LanguageDetectionService.name);

  constructor(private readonly http: HttpService) {}

  fromMetadata(defaultAudioLanguage?: string): LanguageDetectionResult | null {
    if (!defaultAudioLanguage) return null;
    // YouTube sometimes returns a region-qualified tag like "en-US" —
    // normalize to the base language code.
    const base = defaultAudioLanguage.split('-')[0].toLowerCase();
    return { language: base, confidence: 1, source: 'metadata', transcriptWasTried: false };
  }

  fromMetadataText(title: string, description?: string): LanguageDetectionResult | null {
    const text = `${title} ${description ?? ''}`.trim();
    if (text.length < METADATA_TEXT_MIN_LENGTH) {
      return null; // not enough text to trust a language guess on
    }

    const francCode = safeFranc(text, { minLength: 10 });
    if (francCode === 'und') {
      return null;
    }

    return {
      language: ISO_639_3_TO_1[francCode] ?? francCode,
      confidence: METADATA_TEXT_CONFIDENCE,
      source: 'metadata',
      transcriptWasTried: false,
    };
  }

  async fromTranscript(youtubeVideoId: string): Promise<LanguageDetectionResult> {
    return transcriptFetchLimit(() => this.fetchTranscriptUnlimited(youtubeVideoId));
  }

  private async fetchTranscriptUnlimited(youtubeVideoId: string): Promise<LanguageDetectionResult> {
    try {
      const trackListUrl = `https://video.google.com/timedtext?type=list&v=${youtubeVideoId}`;
      const { data: trackListXml } = await firstValueFrom(
        this.http.get<string>(trackListUrl, { timeout: 8_000, responseType: 'text' as any }),
      );

      const firstTrackLang = this.extractFirstTrackLang(trackListXml);
      if (!firstTrackLang) {
        // No caption tracks at all — legitimate, common, not a parse bug.
        return { language: null, confidence: null, source: 'uncertain', transcriptWasTried: true };
      }

      const transcriptUrl = `https://video.google.com/timedtext?lang=${firstTrackLang}&v=${youtubeVideoId}`;
      const { data: transcriptXml } = await firstValueFrom(
        this.http.get<string>(transcriptUrl, { timeout: 8_000, responseType: 'text' as any }),
      );

      const plainText = this.stripTimedTextMarkup(transcriptXml);
      if (plainText.length < 50) {
        // Too little text to trust a language-ID result on.
        return { language: null, confidence: null, source: 'uncertain', transcriptWasTried: true };
      }

      const francCode = safeFranc(plainText, { minLength: 10 });
      if (francCode === 'und') {
        return { language: null, confidence: null, source: 'uncertain', transcriptWasTried: true };
      }

      return {
        language: ISO_639_3_TO_1[francCode] ?? francCode,
        confidence: TRANSCRIPT_CONFIDENCE, // franc doesn't expose a numeric confidence; a fixed, documented estimate for a text-based (not audio) signal
        source: 'transcript',
        transcriptWasTried: true,
      };
    } catch (err: any) {
      const status = err?.response?.status;

      if (status === 429) {
        // Rate-limited, not broken. Logged at a quieter level than a real
        // failure — this is expected to happen occasionally under load
        // and is not, by itself, something an on-call engineer needs to
        // see. No retry: retrying immediately into a 429 just adds to the
        // problem the limiter above is trying to prevent.
        this.logger.debug(`Transcript fetch rate-limited (429) for ${youtubeVideoId} — falling back gracefully`);
        return {
          language: null,
          confidence: null,
          source: 'uncertain',
          transcriptWasTried: true,
          rateLimited: true,
        };
      }

      // Raw failure logged, never surfaced as a wrong language — this is
      // the exact "unofficial endpoint can change without notice" case
      // the Phase 3 canary job exists to catch before a user does.
      this.logger.warn(`Transcript fetch/parse failed for ${youtubeVideoId}: ${(err as Error).message}`);
      return { language: null, confidence: null, source: 'uncertain', transcriptWasTried: true };
    }
  }

  private extractFirstTrackLang(trackListXml: string): string | null {
    const match = /<track[^>]*lang_code="([^"]+)"/.exec(trackListXml);
    return match?.[1] ?? null;
  }

  private stripTimedTextMarkup(xml: string): string {
    return xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
