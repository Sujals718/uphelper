import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AccessTokenPayload, AuthTokenResponse } from '@uphelper/shared-types';
import type { GoogleValidatedProfile } from './google.strategy';

const REFRESH_COOKIE_NAME = 'uphelper_refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  private refreshCookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/auth', // only sent back to /auth/* endpoints, not every request
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    };
  }

  /** Kicks off the Google OAuth redirect flow. */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {
    // Passport's GoogleStrategy handles the redirect to Google itself —
    // this handler body never runs.
  }

  /**
   * Google redirects back here after consent. We mint our own tokens and
   * hand the user back to the frontend. The access token is passed via a
   * URL fragment (`#accessToken=...`), not a query string — fragments are
   * never sent to the server in subsequent requests or logged by it, so
   * this keeps the token out of server access logs while still getting it
   * to frontend JS for one read. The refresh token never appears in the
   * URL at all; it's set directly as the httpOnly cookie below.
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as GoogleValidatedProfile;
    const user = await this.usersService.findOrCreateFromGoogle(profile);
    const { accessToken, refreshToken } = await this.authService.issueTokensForUser(user);

    res.cookie(REFRESH_COOKIE_NAME, `${user.id}.${refreshToken}`, this.refreshCookieOptions());

    const webOrigin = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    const redirectPath = user.role === 'admin' ? '/admin' : '/dashboard';
    res.redirect(
      `${webOrigin}/auth/callback#accessToken=${encodeURIComponent(accessToken)}&redirect=${encodeURIComponent(redirectPath)}`,
    );
  }

  /** Rotates the refresh token and issues a fresh access token. */
  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const presented = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!presented) {
      throw new UnauthorizedException('No refresh token cookie present');
    }
    // The raw refresh token is opaque (just random bytes) and we only ever
    // store its hash, so there's nothing in the token itself to look the
    // user up by. We solve that by storing the cookie as `${userId}.${raw}`
    // instead of the raw token alone — the userId half is not a secret (the
    // secret is the random half, which is what actually gets hash-verified
    // below), so this doesn't weaken anything, it just avoids needing a
    // second lookup mechanism.
    const [userId, rawToken] = presented.split('.');
    if (!userId || !rawToken) {
      throw new UnauthorizedException('Malformed refresh token');
    }
    const { accessToken, refreshToken } = await this.authService.rotateRefreshToken(
      userId,
      rawToken,
    );
    res.cookie(REFRESH_COOKIE_NAME, `${userId}.${refreshToken}`, this.refreshCookieOptions());
    const user = await this.usersService.findById(userId);
    const body: AuthTokenResponse = this.authService.buildAuthResponse(user!, accessToken);
    res.json(body);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() currentUser: AccessTokenPayload,
    @Res() res: Response,
  ): Promise<void> {
    await this.authService.logout(currentUser.sub);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
    res.status(204).send();
  }
}
