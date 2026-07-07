import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@uphelper/shared-types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LinkPlatformDto } from './dto/link-platform.dto';
import { PlatformsService } from './platforms.service';

@UseGuards(JwtAuthGuard)
@Controller('platforms')
export class PlatformsController {
  constructor(private readonly platforms: PlatformsService) {}

  // Registered before the ':platform/...' routes below so Express doesn't
  // try to match "status" as a :platform param — order matters here.
  @Get('status')
  status() {
    return this.platforms.status();
  }

  @Post(':platform/link')
  link(
    @CurrentUser() user: AccessTokenPayload,
    @Param('platform') platform: string,
    @Body() dto: LinkPlatformDto,
  ) {
    return this.platforms.link(user.sub, platform, dto.handle);
  }

  @Delete(':platform/unlink')
  unlink(@CurrentUser() user: AccessTokenPayload, @Param('platform') platform: string) {
    return this.platforms.unlink(user.sub, platform);
  }

  @Post(':platform/sync')
  sync(@CurrentUser() user: AccessTokenPayload, @Param('platform') platform: string) {
    return this.platforms.sync(user.sub, platform);
  }

  @Get(':platform/contests')
  contests(@CurrentUser() user: AccessTokenPayload, @Param('platform') platform: string) {
    return this.platforms.getContests(user.sub, platform);
  }
}
