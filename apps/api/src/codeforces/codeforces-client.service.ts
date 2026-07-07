import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import type {
  CfApiEnvelope,
  CfContest,
  CfProblem,
  CfSubmission,
  CfUserInfo,
} from './codeforces-api.types';

const BASE_URL = 'https://codeforces.com/api';


@Injectable()
export class CodeforcesClient {
  private readonly logger = new Logger(CodeforcesClient.name);

  constructor(private readonly http: HttpService) {}

  private async call<T>(method: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams(params).toString();
    const url = `${BASE_URL}/${method}${query ? `?${query}` : ''}`;

    let envelope: CfApiEnvelope<T>;
    try {
      const { data } = await firstValueFrom(
        this.http.get<CfApiEnvelope<T>>(url, { timeout: 10_000 }),
      );
      envelope = data;
    } catch (err) {
      // Network-level failure: timeout, DNS, CF fully down. Distinct from a
      // CF-returned error below — this one means we never got a response
      // to interpret at all.
      this.logger.error(`Codeforces API "${method}" unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Codeforces is temporarily unavailable');
    }

    if (envelope.status !== 'OK' || envelope.result === undefined) {
      // Codeforces DID respond, but with its own failure envelope — e.g.
      // "handle not found", or a malformed request. This is a known,
      // structured failure shape, not a crash.
      this.logger.warn(`Codeforces API "${method}" returned FAILED: ${envelope.comment}`);
      if (/not found/i.test(envelope.comment ?? '')) {
        throw new NotFoundException(envelope.comment ?? 'Codeforces resource not found');
      }
      throw new ServiceUnavailableException(
        `Codeforces API error: ${envelope.comment ?? 'unknown error'}`,
      );
    }

    return envelope.result;
  }

  /** Confirms a handle exists before we ever store it. */
  async verifyHandle(handle: string): Promise<CfUserInfo> {
    const [info] = await this.call<CfUserInfo[]>('user.info', { handles: handle });
    return info;
  }

  /** Every submission the user has ever made, across all contests and practice. */
  async getUserSubmissions(handle: string): Promise<CfSubmission[]> {
    return this.call<CfSubmission[]>('user.status', { handle });
  }

  /**
   * The full Codeforces problem catalog. Identical for every user, so it's
   * fetched once per sync (not once per contest) — this is what lets us
   * derive each contest's total-problem count and problem metadata (name,
   * tags) from a SINGLE call instead of one `contest.standings` call per
   * contest the user has ever attended, which would be far more expensive
   * for an account with a long contest history.
   */
  async getAllProblems(): Promise<CfProblem[]> {
    const result = await this.call<{ problems: CfProblem[] }>('problemset.problems', {});
    return result.problems;
  }

  /** Every contest CF has ever run. Also global, also fetched once per sync. */
  async getContestList(): Promise<CfContest[]> {
    return this.call<CfContest[]>('contest.list', { gym: 'false' });
  }

  /** Cheap liveness check for the admin platform-health screen (Phase 7). */
  async ping(): Promise<boolean> {
    try {
      await this.call<CfContest[]>('contest.list', { gym: 'false' });
      return true;
    } catch {
      return false;
    }
  }
}
