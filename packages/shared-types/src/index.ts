// @uphelper/shared-types

export type UserRole = 'user' | 'admin';
export * from './platforms';
export * from './mistakes';
export * from './revision';
export * from './videos';
export * from './prompts';
export * from './analytics';
export * from './admin';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
}

/** Payload encoded inside the short-lived JWT access token. */
export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/** Shape returned by POST /auth/refresh and the OAuth callback. */
export interface AuthTokenResponse {
  accessToken: string;
  user: PublicUser;
  // Note: the refresh token itself is never in the JSON body — it's set
  // as an httpOnly cookie by the server, never exposed to client JS.
}