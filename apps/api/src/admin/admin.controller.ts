import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@uphelper/shared-types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';
import { SearchUsersDto } from './dto/search-users.dto';
import { SetUserDisabledDto } from './dto/set-user-disabled.dto';
import { UpdatePromptTemplateDto } from './dto/update-prompt-template.dto';

// Every route in here requires a valid access token AND role === 'admin'.
// JwtAuthGuard runs first (populates request.user from the bearer token),
// then RolesGuard checks that user's role against @Roles('admin') — same
// two-guard stacking order used anywhere else in the app that needs
// role-gating, per roles.guard.ts's own design (it no-ops to `true` for
// routes with no @Roles(), so JwtAuthGuard alone still applies elsewhere).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(@Query() query: SearchUsersDto) {
    return this.admin.listUsers(query.search, query.page, query.pageSize);
  }

  @Patch('users/:id')
  setUserDisabled(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: SetUserDisabledDto,
  ) {
    return this.admin.setUserDisabled(user.sub, id, dto.isDisabled);
  }

  @Get('platform-health')
  platformHealth() {
    return this.admin.platformHealth();
  }

  @Get('video-pipeline-metrics')
  videoPipelineMetrics() {
    return this.admin.videoPipelineMetrics();
  }

  @Get('prompt-templates')
  listPromptTemplates() {
    return this.admin.listPromptTemplates();
  }

  // "Update" always creates a new version and activates it — see
  // AdminService.updateActivePromptTemplate's own comment for why this is
  // never an in-place overwrite of an existing row.
  @Patch('prompt-templates')
  updatePromptTemplate(@Body() dto: UpdatePromptTemplateDto) {
    return this.admin.updateActivePromptTemplate(dto.type, dto.body);
  }
}
