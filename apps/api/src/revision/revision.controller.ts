import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@uphelper/shared-types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRevisionItemDto } from './dto/create-revision-item.dto';
import { UpdateRevisionItemDto } from './dto/update-revision-item.dto';
import { RevisionService } from './revision.service';

@UseGuards(JwtAuthGuard)
@Controller('revision')
export class RevisionController {
  constructor(private readonly revision: RevisionService) {}

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateRevisionItemDto) {
    return this.revision.create(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.revision.list(user.sub);
  }

  // Doubles as "edit this item" and "I just reviewed it" — see
  // UpdateRevisionItemDto.grade. No separate /review route; 
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRevisionItemDto,
  ) {
    return this.revision.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.revision.remove(user.sub, id);
  }
}
