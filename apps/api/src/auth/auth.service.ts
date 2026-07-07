import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { User } from '@prisma/client';
import type { AccessTokenPayload, AuthTokenResponse, PublicUser } from '@uphelper/shared-types';
import { UsersService } from '../users/users.service';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private signAccessToken(user: User): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
  }

  /**
   * Refresh tokens are opaque random strings, NOT JWTs — there's nothing to
   * decode, they're just a high-entropy lookup credential. We store only
   * their argon2id hash in the users table, so a database leak alone does
   * not hand out usable tokens (mirrors how you'd never store a raw
   * password). This is also why refresh validation is a hash comparison,
   * not a signature check.
   */
  private async issueRefreshToken(user: User): Promise<string> {
    const rawToken = randomBytes(48).toString('hex');
    const hash = await argon2.hash(rawToken, { type: argon2.argon2id });
    await this.usersService.setRefreshTokenHash(user.id, hash);
    return rawToken;
  }

  async issueTokensForUser(user: User): Promise<IssuedTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      Promise.resolve(this.signAccessToken(user)),
      this.issueRefreshToken(user),
    ]);
    return { accessToken, refreshToken };
  }

  /**
   * Refresh token ROTATION: every use invalidates the old token by
   * overwriting the stored hash with a new one. If a stolen old token is
   * ever replayed after the legitimate user has already rotated past it,
   * the hash comparison fails — that mismatch is the detection signal for
   * "this refresh token was reused," which is exactly what rotation is for.
   */
  async rotateRefreshToken(userId: string, presentedRawToken: string): Promise<IssuedTokens> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('No active session for this user');
    }
    const valid = await argon2.verify(user.refreshTokenHash, presentedRawToken);
    if (!valid) {
      // Defensive: a mismatch here means the presented token is stale or
      // forged. Invalidate the stored session outright rather than leaving
      // a token active that just failed verification.
      await this.usersService.setRefreshTokenHash(user.id, null);
      throw new UnauthorizedException('Invalid or reused refresh token');
    }
    return this.issueTokensForUser(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  buildAuthResponse(user: User, accessToken: string): AuthTokenResponse {
    return { accessToken, user: this.toPublicUser(user) };
  }
}
