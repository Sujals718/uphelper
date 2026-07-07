import { Injectable, NotFoundException } from '@nestjs/common';
import type { PromptType } from '@prisma/client';
import type { FilledPromptResponse } from '@uphelper/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { fillTemplate } from './fill-template.util';
import { GetHintPromptDto } from './dto/get-hint-prompt.dto';
import { GetDebugPromptDto } from './dto/get-debug-prompt.dto';

@Injectable()
export class PromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHintPrompt(dto: GetHintPromptDto): Promise<FilledPromptResponse> {
    const template = await this.getActiveTemplate('hint');

    
    const filledText = fillTemplate(template.body, {
      problem_name: dto.problemName,
      platform: dto.platform,
      contest_name: dto.contestName,
      problem_statement: dto.problemStatement ?? '',
    });

    return { type: 'hint', version: template.version, filledText };
  }

  async getDebugPrompt(dto: GetDebugPromptDto): Promise<FilledPromptResponse> {
    const template = await this.getActiveTemplate('debug');

    const filledText = fillTemplate(template.body, {
      problem_name: dto.problemName,
      platform: dto.platform,
      contest_name: dto.contestName,
      user_code: dto.userCode,
    });

    return { type: 'debug', version: template.version, filledText };
  }

  
  private async getActiveTemplate(type: PromptType) {
    const template = await this.prisma.promptTemplate.findFirst({
      where: { type, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!template) {
      throw new NotFoundException(
        `No active "${type}" prompt template found — has the database been seeded? (npx prisma db seed)`,
      );
    }

    return template;
  }
}
