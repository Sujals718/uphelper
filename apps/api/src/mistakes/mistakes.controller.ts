import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@uphelper/shared-types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMistakeDto } from './dto/create-mistake.dto';
import { UpdateMistakeDto } from './dto/update-mistake.dto';
import { MistakesService } from './mistakes.service';

@UseGuards(JwtAuthGuard)
@Controller('mistakes')
export class MistakesController {
  constructor(private readonly mistakes: MistakesService) {}

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateMistakeDto) {
    return this.mistakes.create(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.mistakes.list(user.sub);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMistakeDto,
  ) {
    return this.mistakes.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.mistakes.remove(user.sub, id);
  }
}
