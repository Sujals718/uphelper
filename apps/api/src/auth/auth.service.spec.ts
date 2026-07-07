import { UserRole } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

function fakeUser(overrides: Partial<any> = {}) {
  return {
    id: 'user-1',
    email: 'a@example.com',
    googleId: 'g-1',
    name: 'A User',
    avatarUrl: null,
    role: UserRole.user,
    isDisabled: false,
    refreshTokenHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'findById' | 'setRefreshTokenHash'>>;

  beforeEach(async () => {
    usersService = {
      findById: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { sign: jest.fn(() => 'signed.jwt.token') } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'test-secret') },
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('issueTokensForUser', () => {
    it('signs an access token and stores a hash of a freshly generated refresh token', async () => {
      const user = fakeUser();
      const { accessToken, refreshToken } = await service.issueTokensForUser(user);

      expect(accessToken).toBe('signed.jwt.token');
      expect(refreshToken).toHaveLength(96); // 48 bytes hex-encoded
      expect(usersService.setRefreshTokenHash).toHaveBeenCalledTimes(1);

      const [, storedHash] = usersService.setRefreshTokenHash.mock.calls[0];
      // The stored value must be an argon2id hash, never the raw token.
      expect(storedHash).not.toBe(refreshToken);
      expect(storedHash).toMatch(/^\$argon2id\$/);
      await expect(argon2.verify(storedHash as string, refreshToken)).resolves.toBe(true);
    });
  });

  describe('rotateRefreshToken', () => {
    it('issues new tokens when the presented raw token matches the stored hash', async () => {
      const rawToken = 'a-valid-raw-refresh-token';
      const hash = await argon2.hash(rawToken, { type: argon2.argon2id });
      const user = fakeUser({ refreshTokenHash: hash });
      usersService.findById.mockResolvedValue(user);

      const result = await service.rotateRefreshToken(user.id, rawToken);

      expect(result.accessToken).toBe('signed.jwt.token');
      // Rotation must overwrite the hash — called once during rotation via
      // issueTokensForUser's internal issueRefreshToken.
      expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
        user.id,
        expect.stringMatching(/^\$argon2id\$/),
      );
    });

    it('rejects and clears the session when the presented token does not match', async () => {
      const hash = await argon2.hash('the-real-token', { type: argon2.argon2id });
      const user = fakeUser({ refreshTokenHash: hash });
      usersService.findById.mockResolvedValue(user);

      await expect(
        service.rotateRefreshToken(user.id, 'a-forged-or-stale-token'),
      ).rejects.toThrow(UnauthorizedException);

      // Defensive invalidation: a failed verify wipes the stored session.
      expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(user.id, null);
    });

    it('rejects when there is no active session for the user', async () => {
      usersService.findById.mockResolvedValue(fakeUser({ refreshTokenHash: null }));

      await expect(service.rotateRefreshToken('user-1', 'anything')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when the user no longer exists', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.rotateRefreshToken('ghost', 'anything')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
