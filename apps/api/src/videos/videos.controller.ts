import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SearchVideosDto } from './dto/search-videos.dto';
import { FlagLanguageDto } from './dto/flag-language.dto';
import { VideosService } from './videos.service';

@UseGuards(JwtAuthGuard)
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get('search')
  search(@Query() dto: SearchVideosDto) {
    return this.videos.search(dto.problemName, dto.platform, dto.contestName, dto.problemCode);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.videos.getById(id);
  }

  @Get(':id/score-breakdown')
  scoreBreakdown(@Param('id') id: string) {
    return this.videos.getScoreBreakdown(id);
  }

  @Post(':id/flag-language')
  flagLanguage(@Param('id') id: string, @Body() dto: FlagLanguageDto) {
    return this.videos.flagLanguage(id, dto.correctedLanguage);
  }
}
