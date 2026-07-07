import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@uphelper/shared-types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('weakness-heatmap')
  weaknessHeatmap(@CurrentUser() user: AccessTokenPayload) {
    return this.analytics.weaknessHeatmap(user.sub);
  }
}
