import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload, PublicUser } from '@uphelper/shared-types';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * The one protected route needs to prove the chain works:
   * landing page -> Google sign-in -> session -> this route succeeds only
   * with a valid access token, 401s otherwise.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() current: AccessTokenPayload): Promise<PublicUser> {
    const user = await this.usersService.findById(current.sub);
    if (!user) {
      throw new NotFoundException('User no longer exists');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
