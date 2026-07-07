import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetHintPromptDto } from './dto/get-hint-prompt.dto';
import { GetDebugPromptDto } from './dto/get-debug-prompt.dto';
import { PromptsService } from './prompts.service';

// No @CurrentUser() anywhere in this controller — unlike Mistakes/Revision,
// prompt filling has no per-user state to scope against. Every request
// with the same inputs produces the same output for every user; it's
// still behind JwtAuthGuard only because every other domain in the app is
// (consistency with the rest of the API surface), not because the
// response itself is user-specific.
@UseGuards(JwtAuthGuard)
@Controller('prompts')
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}

  @Get('hint')
  getHint(@Query() dto: GetHintPromptDto) {
    return this.prompts.getHintPrompt(dto);
  }

  @Post('debug')
  getDebug(@Body() dto: GetDebugPromptDto) {
    return this.prompts.getDebugPrompt(dto);
  }
}
